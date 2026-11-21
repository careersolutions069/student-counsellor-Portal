import test from 'node:test';import assert from 'node:assert/strict';
import {prepareUploadForm} from '../lib/upload-submission';
test('upload capture omits unselected optional files and preserves fields, selections and selected file bytes',async()=>{
 const form=new FormData();form.set('id','student-id');form.append('selected_courses','MBBS');form.append('selected_courses','BDS');form.set('college_pdf',new File([],''));
 const selected=new File(['%PDF-1.7\nFixture'],'marksheet.pdf',{type:'application/pdf'});form.set('file',selected);
 prepareUploadForm(form);
 assert.equal(form.has('college_pdf'),false);assert.equal(form.get('id'),'student-id');assert.deepEqual(form.getAll('selected_courses'),['MBBS','BDS']);assert.equal(await (form.get('file') as File).text(),'%PDF-1.7\nFixture');
});
test('a deliberately selected empty file is preserved for server validation',()=>{
 const form=new FormData();form.set('file',new File([],'empty.pdf',{type:'application/pdf'}));prepareUploadForm(form);assert.equal((form.get('file') as File).name,'empty.pdf');
});
