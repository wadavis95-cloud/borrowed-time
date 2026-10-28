import test from 'node:test';
import assert from 'node:assert/strict';
import {percentile,stats,Samples,localOrigin} from '../scripts/perf/metrics.mjs';
import {parseOptions} from '../scripts/measure-capacity.mjs';

test('capacity percentiles use nearest ranks and handle absent measurements explicitly',()=>{
 assert.equal(percentile([], .95),null);
 assert.equal(percentile([100,2,1,3,4],.95),100);
 assert.equal(percentile([100,2,1,3,4],.5),3);
 assert.deepEqual(stats([]),{count:0,p50:null,p95:null,p99:null,max:null});
 const samples=new Samples(2);for(const value of [1,2,3,NaN])samples.add(value);
 assert.equal(samples.summary().count,2);assert.equal(samples.summary().seen,3);assert.equal(samples.summary().truncated,true);assert.equal(samples.summary().max,3);
 const a=new Samples(10),b=new Samples(10);for(let i=1;i<=1000;i++){a.add(i);b.add(i);}
 assert.deepEqual(a.values,b.values);assert.ok(a.values.some(v=>v>500),'bounded sampling includes later load');assert.equal(a.summary().max,1000);
});
test('capacity tool rejects remote targets, credentials and unbounded runs',()=>{
 assert.equal(localOrigin('http://127.0.0.1:4173').hostname,'127.0.0.1');
 for(const target of ['https://borrowed-time.onrender.com','http://example.com','http://127.0.0.1.example.com','http://user:secret@127.0.0.1','http://127.0.0.1/race'])assert.throws(()=>localOrigin(target));
 assert.deepEqual(parseOptions([]),{seconds:20,profile:'baseline'});
 for(const args of [['--seconds=0'],['--seconds=999'],['--seconds=NaN'],['--profile=public'],['https://borrowed-time.onrender.com']])assert.throws(()=>parseOptions(args));
});
