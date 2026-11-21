import test from 'node:test';
import assert from 'node:assert/strict';
import { visitSchema, selectedCourses, validateCollegePdf } from '../lib/visit-conversion';
import { registrationSchema } from '../lib/validation';
const details={full_name:'Aditi', 'F/N':'Parent',student_phone:'+91 98765 43210',city:'Patna',state:'Bihar',counselling_amount:'1500.50',percentage_or_score:'610',marks_type:'exact',selected_courses:['MBBS','BDS'],college_type:'government'};
test('visit details require every conversion field and one to three distinct courses',()=>{
 assert.equal(visitSchema.parse(details).student_phone,'9876543210');
 for(const field of ['full_name','F/N','city','state','percentage_or_score','marks_type','college_type']) assert.equal(visitSchema.safeParse({...details,[field]:''}).success,false,field);
 for(const amount of ['0','-1','1.005','Infinity','10000000000']) assert.equal(visitSchema.safeParse({...details,counselling_amount:amount}).success,false,amount);
 for(const courses of [[],['MBBS','MBBS'],['B.Com']]) assert.equal(visitSchema.safeParse({...details,selected_courses:courses}).success,false);
 assert.deepEqual(selectedCourses([], 'Interested in MBBS, BDS / BAMS'),['MBBS','BDS','BAMS']);
 assert.deepEqual(selectedCourses(['BAMS'],'MBBS'),['BAMS']);
});
test('college PDFs accept up to 4 MiB and reject spoofed or non-PDF files',()=>{
 const header=Buffer.from('%PDF-1.7');
 assert.doesNotThrow(()=>validateCollegePdf({name:'Government.PDF',type:'application/pdf',size:4*1024*1024},header));
 assert.throws(()=>validateCollegePdf({name:'large.pdf',type:'application/pdf',size:4*1024*1024+1},header),{message:'File must be 4 MB or smaller'});
 for(const file of [{name:'x.jpg',type:'image/jpeg',size:10},{name:'x.pdf',type:'application/pdf',size:4*1024*1024+1},{name:'x.pdf',type:'application/pdf',size:0}]) assert.throws(()=>validateCollegePdf(file,header));
 assert.throws(()=>validateCollegePdf({name:'x.pdf',type:'application/pdf',size:10},Buffer.from('<html>')));
});
test('login normalization accepts legacy and new IDs and rejects malformed values',()=>{
 assert.equal(registrationSchema.parse(' cs-pat-2026-k8m4x9 '),'CS-PAT-2026-K8M4X9');
 assert.equal(registrationSchema.parse('CS-PAT-2026-0001'),'CS-PAT-2026-0001');
 for(const value of ['CS-PAT-26-K8M4X9','CS-PAT-2026-A_BC','CS-PAT-2026-123','CS-PAT-2026-123456789']) assert.equal(registrationSchema.safeParse(value).success,false);
});
