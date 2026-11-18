import {createClient} from '@supabase/supabase-js';
import {unzipSync, strFromU8} from 'fflate';
const {VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY} = import.meta.env;
export const db = VITE_SUPABASE_URL && VITE_SUPABASE_PUBLISHABLE_KEY
  ? createClient(VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY) : null;
export const files = () => db.storage.from('editorial-attachments');
export async function result(request) {
  const {data,error} = await request;
  if (error) throw error;
  return data;
}
export async function extractText(file) {
  if (/\.txt$/i.test(file.name)) return file.text();
  if (!/\.docx$/i.test(file.name)) return '';
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: entry => entry.name === 'word/document.xml' && entry.originalSize <= 4_000_000,
  });
  if (!archive['word/document.xml']) throw Error('Documento Word non leggibile. Incolla il testo manualmente.');
  const doc = new DOMParser().parseFromString(strFromU8(archive['word/document.xml']), 'application/xml');
  const ns = '*';
  return Array.from(doc.getElementsByTagNameNS(ns,'p'), paragraph =>
    Array.from(paragraph.getElementsByTagNameNS(ns,'t'), element => element.textContent).join('')).join('\n');
}
