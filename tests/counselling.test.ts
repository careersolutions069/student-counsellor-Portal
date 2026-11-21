import test from 'node:test';
import assert from 'node:assert/strict';
import {preferredStatesSchema, slotSchema, stageCategory, slotUnlocked, documentLabel} from '../lib/counselling';
test('preferred states allow up to five distinct recognized states',()=>{
 assert.deepEqual(preferredStatesSchema.parse(['Bihar','Delhi']),['Bihar','Delhi']);
 for(const value of [['Bihar','Bihar'],['Unknown'],['Bihar','Delhi','Assam','Goa','Punjab','Kerala']]) assert.equal(preferredStatesSchema.safeParse(value).success,false);
});
test('phase categories and slot locks enforce the six-phase workflow',()=>{
 assert.deepEqual([1,2,3,4,5,6].map(stageCategory),['stage_doc_1_3','stage_doc_1_3','stage_doc_1_3','stage_doc_4_5','stage_doc_4_5','stage_doc_6']);
 const state={preferred_states:[],current_phase:1,allotted_phase:null,finished:false};
 assert.equal(slotUnlocked('choice_pdf',2,state,[]),false);
 assert.equal(slotUnlocked('stage_doc_4_5',null,state,[]),false);
 assert.equal(slotUnlocked('allotment_letter',1,state,[]),false);
 assert.equal(slotUnlocked('new_choice_pdf',null,state,[]),false);
 assert.equal(slotUnlocked('choice_pdf',1,state,[]),true);
 assert.equal(slotUnlocked('new_choice_pdf',null,{...state,allotted_phase:1,finished:true},[]),true);
 assert.equal(slotSchema.safeParse({doc_category:'choice_pdf',phase_number:null}).success,false);
 assert.equal(slotSchema.safeParse({doc_category:'security_deposit',phase_number:1}).success,false);
 assert.match(documentLabel('choice_pdf',3),/Phase 3/);
});
