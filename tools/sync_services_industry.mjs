import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const source=new URL('public/reference-data/services-industry/digitization.json',root);
const plan=JSON.parse(fs.readFileSync(source,'utf8'));
fs.writeFileSync(new URL('src/services-industry-data.ts',root),'// Generated from archived digitization.json; edit the JSON and run tools/sync_services_industry.mjs.\nexport const servicesIndustryPlan = '+JSON.stringify(plan,null,2)+';\n');
