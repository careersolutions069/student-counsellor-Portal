import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {parseLeadFile,SAMPLE_CSV} from '../lib/lead-import';
const csv=(value:string)=>new TextEncoder().encode(value);
test('CSV aliases normalize phones, preserve sibling contacts and skip invalid/intra-file duplicate rows',()=>{
 const result=parseLeadFile(csv('NAME,Mobile,Father Phone,Source,Course,Stream,Score,City,State\nA,+91 98765-43210,09100000001,School,MBBS,PCB,610,Patna,Bihar\nB,09876543211,9100000001,Walk in,BDS,PCB,600,Patna,Bihar\nC,919876543210,,,,,,,\n,9876543212,,,,,,,\nD,bad,,,,,,,\nE,9876543213,invalid,,,,,,\n'),'leads.csv');
 assert.equal(result.rows.length,6);assert.equal(result.valid.length,2);assert.equal(result.duplicate_count,1);assert.equal(result.invalid_count,3);assert.equal(result.parent_warning_count,1);
 assert.equal(result.valid[0].student_phone,'9876543210');assert.equal(result.valid[1].parent_phone,'9100000001');assert.equal(result.rows[2].row_number,4);
 assert.equal(parseLeadFile(csv(SAMPLE_CSV),'template.csv').valid.length,1);
});
test('XLSX and legacy XLS accept numeric phones without losing first worksheet row numbers',()=>{
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Student Name','Student Phone','Marks'],['A',9876543210,610],[],['B','+91 9876543211','Approx 600']]),'Leads');
 for(const bookType of ['xlsx','biff8'] as const){const result=parseLeadFile(XLSX.write(wb,{bookType,type:'array'}),bookType==='xlsx'?'test.xlsx':'test.xls');assert.equal(result.valid.length,2);assert.equal(result.valid[1].row_number,4);assert.equal(result.valid[0].percentage_or_score,'610');}
});
test('import boundaries reject oversized files and ambiguous/missing headers',()=>{
 assert.throws(()=>parseLeadFile(new Uint8Array(4194305),'big.csv'),/4 MB/);
 assert.throws(()=>parseLeadFile(csv('Name,Phone,Mobile\nA,9876543210,9876543211'),'ambiguous.csv'),/duplicate|ambiguous/i);
 assert.throws(()=>parseLeadFile(csv('Name,City\nA,Patna'),'missing.csv'),/phone/i);
 assert.throws(()=>parseLeadFile(csv('Name,Phone\nA,9876543210'),'fake.pdf'),/CSV|Excel/i);
});

test('parser rejects oversized row counts, expanded archives and mixed-letter phone values',()=>{
 assert.throws(()=>parseLeadFile(csv('Name,Phone\n'+Array.from({length:5001},(_,i)=>`A,${9900100000+i}`).join('\n')),'many.csv'),/5000/);
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Name','Phone'],['A','bad9876543210']]),'Leads');
 assert.equal(parseLeadFile(XLSX.write(wb,{bookType:'xlsx',type:'array'}),'bad-phone.xlsx').invalid_count,1);
 const archive=new Uint8Array(XLSX.write(wb,{bookType:'xlsx',type:'array'}));const view=new DataView(archive.buffer,archive.byteOffset,archive.byteLength);
 for(let i=0;i<archive.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,40*1024*1024,true);break;}
 assert.throws(()=>parseLeadFile(archive,'expanded.xlsx'),/Expanded Excel workbook/);
});
