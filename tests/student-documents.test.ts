import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocumentFile, loginMessage, admissionStep, definiteUploadRollback } from '../lib/student-documents';
test('file validation enforces size, extension, MIME and signature', () => {
 const pdf=Buffer.from('%PDF-1.7\nfixture');
 assert.equal(validateDocumentFile({name:'marks.PDF',type:'application/pdf',size:pdf.length},pdf).extension,'pdf');
 assert.doesNotThrow(()=>validateDocumentFile({name:'max.pdf',type:'application/pdf',size:4*1024*1024},pdf));
 assert.throws(()=>validateDocumentFile({name:'large.pdf',type:'application/pdf',size:4*1024*1024+1},pdf),{message:'File must be 4 MB or smaller'});
 for(const file of [{name:'x.exe',type:'application/pdf',size:pdf.length},{name:'x.pdf',type:'text/html',size:pdf.length},{name:'x.pdf',type:'application/pdf',size:4*1024*1024+1},{name:'x.pdf',type:'application/pdf',size:0}]) assert.throws(()=>validateDocumentFile(file,pdf));
 assert.throws(()=>validateDocumentFile({name:'x.png',type:'image/png',size:pdf.length},pdf));
 assert.equal(validateDocumentFile({name:'photo.jpeg',type:'image/jpeg',size:3},Buffer.from([255,216,255])).mime,'image/jpeg');
 assert.equal(validateDocumentFile({name:'photo.png',type:'image/png',size:8},Buffer.from([137,80,78,71,13,10,26,10])).mime,'image/png');
});
test('login message contains the standard slip without disclosing DOB',()=>{
 const text=loginMessage('Aditi & family','CS-PAT-2026-0001','https://portal.example/path');
 for(const value of ['Aditi & family','CS-PAT-2026-0001','https://portal.example/login','Date of Birth']) assert.ok(text.includes(value));
 assert.ok(!text.includes('/path'));
});
test('admission tracker uses public evidence and never verifies an empty checklist',()=>{
 assert.equal(admissionStep('Counselling',[],[]),0);
 assert.equal(admissionStep('Counselling',[{admission_status:'Pending'}],[]),1);
 assert.equal(admissionStep('Counselling',[],[{status:'Verified'}]),2);
 assert.equal(admissionStep('Counselling',[],[{status:'Verified'},{status:'Pending'}]),0);
 assert.equal(admissionStep('Applied',[],[]),3);
 assert.equal(admissionStep('Counselling',[{admission_status:'Applied'}],[]),3);
 assert.equal(admissionStep('Counselling',[{admission_status:'Admission Confirmed'}],[]),4);
 assert.equal(admissionStep('Admitted',[],[]),4);
 for(const legacy of ['Confirmed','Admitted','admission confirmed','Application Submitted','Verbally confirmed',null]) assert.ok(admissionStep('Counselling',[{admission_status:legacy}],[])<=1,`${legacy} must not advance the tracker`);
 assert.equal(admissionStep('Counselling',[{admission_status:'Not Admitted'},{admission_status:'Withdrawn'}],[]),1);
});

test('uncertain transport errors never authorize deleting a possibly committed upload',()=>{
 assert.equal(definiteUploadRollback({code:'P0001'}),true);
 assert.equal(definiteUploadRollback({code:'23514'}),true);
 assert.equal(definiteUploadRollback({code:'PGRST000'}),false);
 assert.equal(definiteUploadRollback({code:'500'}),false);
 assert.equal(definiteUploadRollback({code:'08007'}),false);
 assert.equal(definiteUploadRollback({code:'40003'}),false);
 assert.equal(definiteUploadRollback(null),false);
});
