// Dormetria · recordatorios diarios de diario de sueño
// Ubicación en el repo:  netlify/functions/recordatorio-horario.mjs
//
// POR QUÉ ESTA FUNCIÓN
// El plan gratuito de OneSignal no repite envíos y solo deja 2 segmentos
// guardados. Por eso los "Recordatorio 09" y "Recordatorio 11" salieron una
// sola vez, el 6 de agosto, y nunca más.
// La API REST de OneSignal SÍ acepta filtros por etiqueta sin necesidad de
// segmentos guardados. Así que el paciente puede elegir CUALQUIER hora y
// esto lo alcanza igual: no hay límite de 2, ni paso extra para nadie.
//
// Corre cada hora en punto. Mira qué hora es en Argentina y le manda solo a
// quienes tienen esa hora configurada y los recordatorios activados.

const ONESIGNAL_APP_ID = '53980618-ff09-4477-94b0-445e5ec18050';

// Hora actual en Argentina (UTC-3, sin horario de verano), en formato "09".
function horaEnArgentina() {
  const fmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    hour12: false
  });
  return String(fmt.format(new Date())).padStart(2, '0');
}

const MENSAJES = [
  'Contá cómo dormiste anoche. Son dos minutos.',
  '¿Ya cargaste tu diario de sueño de hoy?',
  'Un registro más para entender tu sueño.',
  'Tu diario de anoche te está esperando.'
];

export default async (req) => {
  const KEY = process.env.ONESIGNAL_REST_API_KEY;
  if (!KEY) {
    return new Response('Falta ONESIGNAL_REST_API_KEY en las variables de entorno', { status: 500 });
  }

  const hh = horaEnArgentina();
  const cuerpo = MENSAJES[new Date().getDate() % MENSAJES.length];

  const payload = {
    app_id: ONESIGNAL_APP_ID,
    // Sin segmentos guardados: el filtro va acá y no tiene límite de cantidad.
    filters: [
      { field: 'tag', key: 'reminder_hour', relation: '=', value: hh },
      { operator: 'AND' },
      { field: 'tag', key: 'reminder_on', relation: '=', value: '1' }
    ],
    headings: { es: 'Dormetria', en: 'Dormetria' },
    contents: { es: cuerpo, en: cuerpo },
    url: 'https://app.dormetria.com/#diary',
    // Si dos envíos se solaparan, el segundo reemplaza al primero en vez de
    // apilarse: nadie quiere tres recordatorios iguales en la pantalla.
    web_push_topic: 'diario-' + hh
  };

  // OneSignal cambió el esquema de autorización. Se prueban los dos.
  async function enviar(auth) {
    return fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: auth
      },
      body: JSON.stringify(payload)
    });
  }

  let res = await enviar('Key ' + KEY);
  if (res.status === 401 || res.status === 403) {
    res = await enviar('Basic ' + KEY);
  }

  const texto = await res.text();
  const resumen = { hora_argentina: hh, status: res.status, respuesta: texto.slice(0, 600) };
  console.log('[RECORDATORIO]', JSON.stringify(resumen));

  return new Response(JSON.stringify(resumen, null, 2), {
    status: res.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' }
  });
};

// Cada hora en punto. La función decide sola a quién le toca.
export const config = { schedule: '0 * * * *' };
