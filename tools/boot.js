const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();p.on('console',m=>{if(m.type()==='error')console.log('E',m.text().slice(0,160))});
await p.goto('http://localhost:8123/dist/test.html');await p.waitForTimeout(25000);
console.log(process.argv[2],':',await p.textContent('#load-text'),'| title shown:',!(await p.$eval('#title',e=>e.hidden)));await b.close()})();
