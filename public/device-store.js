// Bearer credentials are HttpOnly cookies. Private CryptoKeys stay non-exportable in IndexedDB.
let database;
function open() {
  if (database) return database;
  database = new Promise((resolve,reject) => {
    const request = indexedDB.open('conappt.device.v1',1);
    request.onupgradeneeded = () => request.result.createObjectStore('device');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Opslaan op dit apparaat is niet beschikbaar.'));
    request.onblocked = () => reject(new Error('Sluit andere Conappt-tabbladen en probeer opnieuw.'));
  });
  return database;
}
export async function deviceGet(key) {
  const db = await open();
  return new Promise((resolve,reject) => {
    const request = db.transaction('device','readonly').objectStore('device').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Je apparaatgegevens konden niet worden gelezen.'));
  });
}
export async function deviceSet(key,value) {
  const db = await open();
  return new Promise((resolve,reject) => {
    const transaction = db.transaction('device','readwrite');
    transaction.objectStore('device').put(value,key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Opslaan op dit apparaat lukt niet.'));
    transaction.onabort = () => reject(new Error('Opslaan op dit apparaat is onderbroken.'));
  });
}
