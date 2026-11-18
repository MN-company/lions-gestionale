export const statuses = {
  received: 'Ricevuto', review: 'In revisione', changes: 'In attesa dell’autore',
  approved: 'Approvato', archived: 'Archiviato',
};
export const kinds = { article: 'Correggi il tuo articolo', service: 'Racconta il tuo service' };
export const districts = 'Ia1 Ia2 Ia3 Ib1 Ib2 Ib3 Ib4 Ta1 Ta2 Ta3 Tb A Ab L La Ya Yb'.split(' ').map(value => '108 ' + value).concat('Multidistretto 108 Italy');
export const areas = ['Vista', 'Fame', 'Ambiente', 'Cancro pediatrico', 'Diabete', 'Giovani', 'Soccorso nelle calamità', 'Lcif', 'Altro'];
export const serviceGroups = [
  ['Che cosa, dove, quando', [['cosa','Che cosa avete fatto','textarea',true], ['dove','Dove','text',true], ['quando','Quando','text',true], ['causa','Area di service','select']]],
  ['Per chi e con quale risultato', [['perchi','A chi è servito','textarea'], ['numeri','I numeri (raccolto, persone raggiunte, ore, materiali)','textarea'], ['impatto','Che cosa è cambiato dopo','textarea'], ['partner','Con chi (enti, scuole, Comuni, associazioni)','text'], ['novita','Perché dovrebbe interessare un Lion di Palermo o di Aosta?','textarea']]],
  ['Prima voce', [['v1n','Nome e cognome','text'], ['v1r','Ruolo','text'], ['v1f','Che cosa ha detto','textarea']]],
  ['Seconda voce', [['v2n','Nome e cognome','text'], ['v2r','Ruolo','text'], ['v2f','Che cosa ha detto','textarea']]],
];
export function headline(item) {
  return (item.kind === 'article' ? item.original : item.fields.cosa).trim().split('\n')[0].slice(0,120) || kinds[item.kind];
}
export function markedParts(text, comments) {
  const positions = new Set([0, text.length]);
  const anchors = comments.filter(({ anchor, anchor_start }) => anchor && text.slice(anchor_start, anchor_start + anchor.length) === anchor);
  for (const {anchor, anchor_start} of anchors) {
    positions.add(anchor_start);
    positions.add(anchor_start + anchor.length);
  }
  const boundaries = [...positions].sort((a,b) => a-b);
  return boundaries.slice(0,-1).map((start,i) => ({
    text: text.slice(start,boundaries[i+1]),
    highlighted: anchors.some(({anchor, anchor_start}) => start >= anchor_start && start < anchor_start + anchor.length),
  }));
}
