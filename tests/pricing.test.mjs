import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAmount, normalizePrices, convertAmount, rankRows, checkoutNetAmount, estimateTaxExclusive, comparisonRows} from '../lib/pricing-core.mjs';
import {taxRateFor} from '../lib/tax-rates.mjs';

test('international price formats retain their true magnitude', () => {
  const cases=[['$19.99','USD',19.99],['22,99 €','EUR',22.99],['₹ 1,999','INR',1999],['₫ 499.000','VND',499000],['Rp 75ribu','IDR',75000],['Rp 1,889juta','IDR',1889000],['د.ب 7.990','BHD',7.99],['9.900 د.ك','KWD',9.9],['¥3,000','JPY',3000],['AED ٩٩٫٩٩','AED',99.99],['CHF 1’299.00','CHF',1299],['FREE','USD',null],['-19.99','USD',null]];
  for(const [label,currency,n] of cases)assert.equal(parseAmount(label,currency),n,label);
});
test('same-name variants, annual and monthly plans must not be merged', () => {
  const rows=normalizePrices('chatgpt','US','美国',{currency:'USD',prices:[{name:'ChatGPT Plus',displayPrice:'$200.00'},{name:'ChatGPT Plus',displayPrice:'$19.99'},{name:'Usage Credits',displayPrice:'$0.99'}]},'https://apps.apple.com/us/','2026-09-20T00:00:00Z');
  assert.equal(rows.length,2);assert.equal(rows[0].amount,19.99);assert.equal(rows[0].cycle,'unknown');assert.notEqual(rows[0].planId,rows[1].planId);
  const plans=normalizePrices('claude','US','美国',{currency:'USD',prices:[{name:'Claude Pro - Monthly',displayPrice:'$20'},{name:'Claude Pro - Annual',displayPrice:'$200'}]},'','');
  assert.deepEqual(plans.map(x=>x.cycle),['month','year']);assert.notEqual(plans[0].planId,plans[1].planId);
});
test('currency conversion uses a shared USD base and never substitutes a missing rate', () => {
  assert.deepEqual(convertAmount(1000,'JPY',{USD:1,JPY:150,CNY:7.2}),{usd:1000/150,cny:48});
  assert.deepEqual(convertAmount(20,'XXX',{USD:1,CNY:7}),{usd:null,cny:null});
});
test('a stale or unconvertible price cannot win the CNY ranking', () => {
  const rows=[{region:'US',fresh:true,cny:140},{region:'JP',fresh:false,cny:50},{region:'IN',fresh:true,cny:80},{region:'XX',fresh:true,cny:null}];
  assert.deepEqual(rankRows(rows).map(r=>r.region),['IN','US']);
});

test('the Chile checkout uses its stated subtotal, not the plan display or a guessed tax deduction', () => {
  const quote={channel:'web',taxBasis:'exclusive',listingAmount:102990,netAmount:86365,taxAmount:0,checkoutTotal:86365};
  assert.equal(checkoutNetAmount(quote),86365);
  assert.notEqual(checkoutNetAmount(quote),102990/1.19);
  assert.notEqual(checkoutNetAmount(quote),102990*(1-0.19));
  assert.deepEqual(convertAmount(checkoutNetAmount(quote),'CLP',{USD:1,CLP:1000,CNY:7}),{usd:86.365,cny:604.555});
});
test('unknown tax is not zero; gross-only and inconsistent checkout records cannot enter net comparison', () => {
  const q={channel:'web',taxBasis:'exclusive',netAmount:100,taxAmount:19,checkoutTotal:119};
  assert.equal(checkoutNetAmount(q),100);
  assert.equal(checkoutNetAmount({...q,taxAmount:null}),null);
  assert.equal(checkoutNetAmount({...q,taxBasis:'unknown'}),null);
  assert.equal(checkoutNetAmount({...q,channel:'ios'}),null);
  assert.equal(checkoutNetAmount({...q,checkoutTotal:100}),null);
  assert.deepEqual(rankRows([{region:'CL',fresh:false,cny:604.555}]),[]);
});

test('tax estimates divide gross by one plus the percent and keep currencies consistent', () => {
  const gross={amount:102990,usd:102.99,cny:720.93};
  const net=estimateTaxExclusive(gross,taxRateFor('CL'));
  assert.equal(net.amount,102990/1.19);
  assert.equal(net.usd,102.99/1.19);
  assert.equal(net.cny,720.93/1.19);
  assert.notEqual(net.amount,86365); // separate checkout evidence must not overwrite this estimate
  assert.ok(Math.abs(net.amount+net.taxAmount-gross.amount)<1e-8);
  assert.equal(estimateTaxExclusive(gross,taxRateFor('HK')).amount,gross.amount);
  assert.equal(estimateTaxExclusive(gross,taxRateFor('US')).amount,null);
  assert.equal(estimateTaxExclusive(gross,taxRateFor('ZZ')).amount,null);
  assert.equal(estimateTaxExclusive(gross,{percent:-5}).amount,null);
  assert.equal(taxRateFor('ID').percent,11);
});

test('net ranking can differ from original-price ranking without altering source prices or mixing screenshots', () => {
  const make=(region,cny,percent)=>({id:region,region,channel:'ios',amount:cny,usd:cny/7,cny,fresh:true,taxEstimate:estimateTaxExclusive({amount:cny,usd:cny/7,cny},{percent})});
  const rows=[make('AA',100,0),make('BB',110,20),make('US',80,null),{id:'web',region:'CL',channel:'web',amount:60,usd:60/7,cny:60,fresh:false}];
  assert.deepEqual(rankRows(comparisonRows(rows,'net')).map(x=>x.region),['BB','AA']);
  assert.deepEqual(rankRows(comparisonRows(rows,'gross')).map(x=>x.region),['US','AA','BB']);
  assert.equal(rows[1].cny,110);
  assert.equal(comparisonRows(rows,'net')[1].originalCny,110);
  assert.equal(comparisonRows(rows,'net')[3].amount,60);
});
