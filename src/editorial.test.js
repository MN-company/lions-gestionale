import {test} from 'node:test';
import assert from 'node:assert/strict';
import {headline,markedParts,serviceGroups} from './editorial.js';

test('gestisce correzioni e schede di service', () => {
  assert.equal(headline({kind:'article',original:'Un titolo\nIl testo'}),'Un titolo');
  assert.equal(headline({kind:'service',fields:{cosa:'Controllo della vista'}}),'Controllo della vista');
  assert.deepEqual(serviceGroups.flatMap(([,fields]) => fields).filter(field => field[3]).map(field => field[0]),['cosa','dove','quando']);
});
test('evidenzia l’occorrenza selezionata anche quando il testo si ripete', () => {
  assert.deepEqual(markedParts('Lion e Lion',[
    {anchor:'Lion',anchor_start:7},{anchor:'assente',anchor_start:0},
  ]),[{text:'Lion e ',highlighted:false},{text:'Lion',highlighted:true}]);
});
