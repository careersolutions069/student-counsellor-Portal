import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_UPLOAD_SIZE, UPLOAD_SIZE_ERROR, uploadSizeError} from '../lib/upload-limits';
test('shared client size check accepts exactly 4 MiB and explains any excess', () => {
  assert.equal(MAX_UPLOAD_SIZE,4194304);
  assert.equal(uploadSizeError({size:4194304}),'');
  assert.equal(uploadSizeError({size:4194305}),UPLOAD_SIZE_ERROR);
  assert.equal(UPLOAD_SIZE_ERROR,'File must be 4 MB or smaller');
  assert.equal(uploadSizeError(undefined),'');
});
