<?php
// What Claude is asked for each kind of screenshot, and the exact JSON shape
// it must answer in (enforced by structured outputs).
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

const WEAPON_CLASSES = ['AR', 'SMG', 'LMG', 'Sniper', 'Marksman', 'Shotgun', 'Launcher', 'Pistol', 'Melee'];
const ATTACHMENT_SLOTS = ['muzzle', 'barrel', 'optic', 'stock', 'laser', 'underbarrel', 'ammunition', 'rearGrip', 'perk'];
const STAT_KEYS = ['damage', 'fireRate', 'accuracy', 'mobility', 'range', 'control'];
const STAT_MAX = 999;
const MATCH_CONFIDENCE = ['high', 'medium', 'low', 'none'];

// Member settings, in the clan's "TB format" order. Labels live in members.html.
const SETTINGS_CODES = ['mpSensitivity', 'brSensitivity', 'mpHud', 'brHud'];
const SETTINGS_OTHER = [
  'device', 'fps', 'graphics', 'fov', 'fppFov', 'fingers', 'gyro', 'rotationMode', 'acceleration',
  'linkSensitivityResolution', 'sensitivitySwitch', 'adsMode', 'adsButtonRotation', 'rFireCameraRotation',
  'fixedRFire', 'syncAdsFovScope', 'gunKickScale', 'recoilRotateScale', 'viewKickScale',
];
const SETTINGS_CODE_MAX = 120;
const SETTINGS_VALUE_MAX = 60;

const AI_SYSTEM_PROMPT = <<<'TXT'
You read screenshots from the mobile game Call of Duty: Mobile (CODM) for the record-keeping website of a clan called ƬƁ (usually rendered "TB").

Rules:
- Transcribe only what is visible. If something is cut off, blurry or not on screen, use an empty string (or null for numbers). Never guess or fill in typical values.
- Player names often use decorative Unicode (ƬƁ, 丨, ঐ, ø, Ʉ, ¶, ヤ, small capitals, accented letters). Copy each name as faithfully as you can, including any clan-tag prefix and separator exactly as shown, for example "TB | Zuka" or "ƬƁ丨Ɓillieঐ".
- Digits matter most. Read UIDs and timestamps character by character.
- Answer only in the JSON format you have been given.
TXT;

const AI_MATCHING_RULES = <<<'TXT'
Matching: the clan's current roster is listed below. Set matchId to the id of the roster member a row refers to, or "" if none fits. People rename and change decorations, so compare the core of the name: ignore clan tags (TB, ƬƁ, ŦB…), separators (|, 丨, ·, ., x), decorative symbols, letter case and suffixes such as "(Ashi)" or ".codm". Aliases are earlier names of the same person. Only match when you are reasonably sure, and say how sure in matchConfidence (high, medium, low, none).
TXT;

function str_prop(): array { return ['type' => 'string']; }
function int_or_null(): array { return ['anyOf' => [['type' => 'integer'], ['type' => 'null']]]; }
function obj(array $props): array {
  return ['type' => 'object', 'additionalProperties' => false, 'required' => array_keys($props), 'properties' => $props];
}

function ai_schema(string $kind): array {
  $match = [
    'matchId' => str_prop(),
    'matchConfidence' => ['type' => 'string', 'enum' => MATCH_CONFIDENCE],
  ];
  switch ($kind) {
    case 'clan':
      return obj([
        'screen' => ['type' => 'string', 'enum' => ['clan_log', 'member_list', 'other']],
        'memberCount' => str_prop(),
        'events' => ['type' => 'array', 'items' => obj([
          'datetime' => str_prop(),
          'action' => ['type' => 'string', 'enum' => ['join', 'quit', 'remove', 'promote', 'demote', 'other']],
          'name' => str_prop(),
          'officer' => str_prop(),
          'position' => str_prop(),
          'logText' => str_prop(),
        ] + $match)],
        'members' => ['type' => 'array', 'items' => obj([
          'name' => str_prop(),
          'position' => str_prop(),
        ] + $match)],
        'notes' => str_prop(),
      ]);
    case 'profile':
      return obj([
        'screen' => ['type' => 'string', 'enum' => ['player_profile', 'other']],
        'name' => str_prop(),
        'uid' => str_prop(),
        'tier' => int_or_null(),
        'clanTag' => str_prop(),
        'likes' => int_or_null(),
        'notes' => str_prop(),
      ] + $match);
    case 'loadout':
      return obj([
        'screen' => ['type' => 'string', 'enum' => ['gunsmith', 'loadout', 'other']],
        'weapon' => str_prop(),
        'weaponClass' => ['type' => 'string', 'enum' => [...WEAPON_CLASSES, '']],
        'buildCode' => str_prop(),
        'buildName' => str_prop(),
        'blueprint' => str_prop(),
        'attachments' => obj(array_fill_keys(ATTACHMENT_SLOTS, str_prop())),
        'stats' => obj(array_fill_keys(STAT_KEYS, int_or_null())),
        'playerName' => str_prop(),
        'notes' => str_prop(),
      ]);
    case 'settings':
      return obj([
        'screen' => ['type' => 'string', 'enum' => ['settings', 'other']],
        'codes' => obj(array_fill_keys(SETTINGS_CODES, str_prop())),
        'other' => obj(array_fill_keys(SETTINGS_OTHER, str_prop())),
        'notes' => str_prop(),
      ]);
  }
  throw new ApiError(400, 'Unknown screenshot type');
}

function roster_lines(array $brief, bool $withUid): string {
  if (!$brief) return '(the roster is empty)';
  $lines = [];
  foreach ($brief as $m) {
    $parts = [$m['id'], $m['name'], implode('; ', $m['aliases']), $m['status']];
    if ($withUid) $parts[] = $m['uid'] !== '' ? $m['uid'] : '-';
    $lines[] = implode(' | ', $parts);
  }
  return implode("\n", $lines);
}

function ai_instructions(string $kind, array $rosterBrief): string {
  switch ($kind) {
    case 'clan':
      return <<<'TXT'
This should be a screenshot of the CLAN screen in CODM, either:
• the CLAN LOG tab: rows of NAME, POSITION, an action (JOIN CLAN, QUIT CLAN, "REMOVE <player> FROM THE CLAN", promotions…) and a timestamp "YYYY-MM-DD HH:MM", newest first; or
• the MEMBER LIST tab: one row per current member with their name and position.
Set "screen" to "clan_log", "member_list" or "other".

For a clan log, add one entry to "events" per visible row, top to bottom:
- datetime: the timestamp exactly as shown, e.g. "2026-10-30 07:08". Skip a row whose timestamp is cut off.
- action: "join" (JOIN CLAN), "quit" (QUIT CLAN / LEFT), "remove" (REMOVE … FROM THE CLAN / KICKED), "promote", "demote", or "other".
- name: the player the row is about. For join and quit rows that is the NAME column. For remove rows it is the player named inside the action text; the NAME column on those rows is the officer who removed them.
- officer: on remove, promote and demote rows, the NAME column (who did it); otherwise "".
- position: the POSITION column as shown (MEMBER, ELITE, CLAN MASTER…).
- logText: the action text as shown.
For a member list, add one entry per visible member to "members" (name and position) and leave "events" empty.
memberCount: the member count if shown (e.g. "25/90"), otherwise "".

{_matching}

Roster (id | name | aliases | status):
{_roster}
TXT;
    case 'profile':
      return <<<'TXT'
This should be a CODM PLAYER PROFILE screen (BASIC tab or the GAME CARD view). It shows the player's name, "TIER n", a clan emblem with the clan tag, and "UID: <digits>" next to a copy icon.
Set "screen" to "player_profile" or "other".
- name: the player name exactly as shown, including any clan-tag prefix (e.g. "TB | Shonny").
- uid: only the digits after "UID:". UIDs are long, usually 18 or 19 digits. Read every digit carefully; if any digit is unreadable, return "" and say so in notes.
- tier: the tier number, or null.
- clanTag: the clan tag next to the clan emblem (e.g. "TB"), or "".
- likes: the Likes count, or null.
For matchId, a roster member with the same UID is certain; otherwise compare names.

{_matching}

Roster (id | name | aliases | status | uid):
{_roster}
TXT;
    case 'loadout':
      return <<<'TXT'
This should be a CODM weapon build screenshot: usually the GUNSMITH screen (weapon name, attachment slots and stat bars), or a loadout / weapon details card.
Set "screen" to "gunsmith", "loadout" or "other".
- weapon: the base weapon name (e.g. "DL Q33", "Type 19"), not the camo or blueprint name.
- weaponClass: one of AR, SMG, LMG, Sniper, Marksman, Shotgun, Launcher, Pistol, Melee. Use the class shown, or the weapon's class in CODM if it isn't shown. Use "" if there is no weapon.
- buildCode: the shareable gunsmith build code, usually at the top left: the weapon name, a dash, then a code of letters and digits (e.g. "Static-HV-1M2A4E5I8C", "ISO Hemlock-1C2D4B6A8A"). Copy it exactly, character by character, including the weapon name part. Use "" if there is no code.
- buildName: a custom name the player gave this build or loadout, if shown; otherwise "". Never put the build code here.
- blueprint: the blueprint, camo or skin name if shown; otherwise "".
- attachments: the exact attachment name in each slot (rearGrip is the rear grip; perk is the weapon perk). Use "" for empty slots and for slots you can't see.
- stats: the numbers for Damage, Fire Rate, Accuracy, Mobility, Range and Control exactly as shown, or null when a stat isn't shown. Values above 100 are normal for some builds (e.g. Fire Rate 111): copy them as they are.
- playerName: a player name only if one is visible on the screenshot; otherwise "".
- notes: one short sentence, only if something important couldn't be read (e.g. "Ammunition slot not visible"); otherwise "". Don't repeat values already in the other fields.
TXT;
    case 'settings':
      return <<<'TXT'
This should be a screenshot of the CODM SETTINGS menu (any tab, e.g. Basic, Sensitivity, Controls, Graphics & Audio), or of a window showing a share code for sensitivity or HUD (custom layout) settings.
Set "screen" to "settings" or "other".
Fill in only the settings visible on this screenshot and use "" for everything else. Never guess or fill in typical values. Copy each value exactly as the game shows it, e.g. "On", "Off", "Max", "Very High", "Hold", "95", "60%". For a slider, give the number shown next to it.

codes: share codes are long strings of letters and digits. Copy every character exactly, in order.
- mpSensitivity: the Multiplayer (MP) sensitivity share code
- brSensitivity: the Battle Royale (BR) sensitivity share code
- mpHud: the Multiplayer custom HUD / layout share code
- brHud: the Battle Royale custom HUD / layout share code
If a code doesn't say whether it is MP or BR, use the mode the screen is set to, and say so in notes.

other (the game's label in quotes):
- device: the phone or tablet model, only if it is shown
- fps: "Frame Rate"
- graphics: "Graphics Quality"
- fov: "Field of View" (FOV)
- fppFov: "FPP Field of View" (first-person FOV)
- fingers: how many fingers the player uses, only if it is shown
- gyro: "Gyroscope"
- rotationMode: "Rotation Mode"
- acceleration: "Acceleration Value"
- linkSensitivityResolution: "Link Sensitivity with Resolution"
- sensitivitySwitch: "Sensitivity Switch"
- adsMode: "ADS Mode"
- adsButtonRotation: "ADS Button for Rotation"
- rFireCameraRotation: "R-Fire Button for Camera Rotation"
- fixedRFire: "Fixed R-Fire Button"
- syncAdsFovScope: "Sync ADS FOV to Scope Zoom"
- gunKickScale: "Gun Kick Scale"
- recoilRotateScale: "Recoil Rotate Scale"
- viewKickScale: "View Kick Scale"
If a setting shows separate MP and BR values, give the MP value and mention the BR value in notes.
- notes: one short sentence only if something important couldn't be read or needs explaining; otherwise "".
TXT;
  }
  throw new ApiError(400, 'Unknown screenshot type');
}

function ai_user_text(string $kind, array $rosterBrief): string {
  $text = ai_instructions($kind, $rosterBrief);
  return strtr($text, [
    '{_matching}' => AI_MATCHING_RULES,
    '{_roster}' => roster_lines($rosterBrief, $kind === 'profile'),
  ]);
}
