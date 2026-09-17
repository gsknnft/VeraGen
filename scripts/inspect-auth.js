import { getAuthTables } from 'better-auth';

const tables = getAuthTables({});
for (const [name, t] of Object.entries(tables)) {
  console.log('TABLE', name, 'model', t.modelName);
  for (const [f, def] of Object.entries(t.fields || {})) {
    console.log(' ', f, JSON.stringify(def));
  }
}
