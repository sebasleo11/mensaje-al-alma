import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const envPath = path.join(process.cwd(), '.env.local');

async function readConfiguredProjectRef() {
  let envStream;
  try {
    envStream = fs.createReadStream(envPath, { encoding: 'utf8' });
  } catch {
    throw new Error('No se pudo leer .env.local.');
  }

  let line;
  try {
    const envLines = readline.createInterface({ input: envStream, crlfDelay: Infinity });
    for await (const candidate of envLines) {
      if (/^\s*(?:export\s+)?NEXT_PUBLIC_SUPABASE_URL\s*=/.test(candidate)) {
        line = candidate;
        break;
      }
    }
    envLines.close();
    envStream.destroy();
  } catch {
    throw new Error('No se pudo leer .env.local.');
  }

  if (!line) throw new Error('No existe NEXT_PUBLIC_SUPABASE_URL en .env.local.');

  const rawValue = line.replace(/^\s*(?:export\s+)?NEXT_PUBLIC_SUPABASE_URL\s*=\s*/, '').trim();
  const unquotedValue = rawValue.replace(/^(['"])(.*)\1\s*(?:#.*)?$/, '$2');

  let hostname;
  try {
    const url = new URL(unquotedValue);
    hostname = url.hostname;
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL no contiene una URL interpretable.');
  }

  const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  if (!match) throw new Error('NEXT_PUBLIC_SUPABASE_URL no corresponde al formato esperado de Supabase.');

  return match[1];
}

async function readProductionRef() {
  const argument = process.argv[2]?.trim();
  if (argument) return argument;

  const prompt = readline.createInterface({ input, output });
  try {
    return (await prompt.question('Ingresá el Project Reference de Production: ')).trim();
  } finally {
    prompt.close();
  }
}

function isValidProjectRef(value) {
  return /^[a-z0-9]{1,64}$/i.test(value);
}

try {
  const localProjectRef = await readConfiguredProjectRef();
  const productionProjectRef = await readProductionRef();

  if (!isValidProjectRef(productionProjectRef)) {
    throw new Error('El Project Reference de Production no tiene un formato válido.');
  }

  if (localProjectRef.toLowerCase() === productionProjectRef.toLowerCase()) {
    console.log('COINCIDE CON PRODUCTION: detener la prueba de pagos.');
  } else {
    console.log('NO COINCIDE CON PRODUCTION: falta confirmar que sea el proyecto de prueba autorizado.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo completar la comparación.');
  process.exitCode = 1;
}
