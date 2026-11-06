// Test stand-in for Firestore: an in-memory collection store with live snapshots.
const stores = (globalThis.__fsStores ||= {});
const listeners = [];
let seq = 0;
function ts(ms) { return { toMillis: () => ms, toDate: () => new Date(ms), __ms: ms }; }
function emit(name) {
  const docs = Object.entries(stores[name] || {})
    .sort((a, b) => (b[1].createdAt?.__ms || 0) - (a[1].createdAt?.__ms || 0))
    .map(([id, data]) => ({ id, data: () => data }));
  listeners.filter(l => l.name === name).forEach(l => l.next({ docs }));
}
export function getFirestore() { return {}; }
export function collection(db, name) { stores[name] ||= {}; return { name }; }
export function query(c) { return c; }
export function orderBy() { return null; }
export function serverTimestamp() { return ts(Date.now() + seq++); }
export function doc(db, name, id) { return { name, id }; }
export async function addDoc(c, data) { const id = 'doc' + (++seq); stores[c.name][id] = data; emit(c.name); return { id }; }
export async function updateDoc(ref, upd) { Object.assign(stores[ref.name][ref.id], upd); emit(ref.name); }
export async function deleteDoc(ref) { delete stores[ref.name][ref.id]; emit(ref.name); }
export function onSnapshot(q, next) { listeners.push({ name: q.name, next }); setTimeout(() => emit(q.name), 0); return () => {}; }
