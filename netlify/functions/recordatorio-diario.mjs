// Dormetria · recordatorio diario del diario de sueño
//
// El plan gratuito de OneSignal no permite envíos recurrentes: solo programar
// uno único. Esta función corre sola en Netlify y le pega a la API de OneSignal
// todos los días, lo que reemplaza esa función paga sin costo.
//
// Ubicación en el repo de la LANDING: netlify/functions/recordatorio-diario.mjs
//
// Variables de entorno en Netlify (Site configuration → Environment variables):
//   ONESIGNAL_APP_ID   = 53980618-ff09-4477-94b0-445e5ec18050
//   ONESIGNAL_API_KEY  = la REST API Key, que en el panel figura como
//                        "Legacy API Key" (OneSignal → Settings → Keys & IDs).
//                        OJO: NO es el App ID. El App ID es público y va en la
//                        app; esta clave es secreta y solo vive acá.
//
// El cron corre a las 12:00 UTC = 09:00 en Argentina. OneSignal después
// entrega a cada persona a la hora local que le corresponde según su etiqueta.

const HORAS = [
  { tag: '09', hora: '9:00AM' },
  { tag: '11', hora: '11:00AM' },
];

export default async () => {
  const APP_ID = process.env.ONESIGNAL_APP_ID;
  const API_KEY = process.env.ONESIGNAL_API_KEY;
  if (!APP_ID || !API_KEY) {
    console.error('Faltan ONESIGNAL_APP_ID u ONESIGNAL_API_KEY');
    return new Response('config', { status: 500 });
  }

  const resultados = [];
  for (const { tag, hora } of HORAS) {
    const body = {
      app_id: APP_ID,
      // Filtro por etiquetas: los mismos campos que la app escribe al
      // guardar el horario del recordatorio.
      filters: [
        { field: 'tag', key: 'reminder_hour', relation: '=', value: tag },
        { operator: 'AND' },
        { field: 'tag', key: 'reminder_on', relation: '=', value: '1' },
      ],
      headings: { en: 'Dormetria', es: '¿Qué tal descansaste anoche?' },
      contents: {
        en: 'Completá tu diario de sueño — te lleva dos minutos.',
        es: 'Completá tu diario de sueño — te lleva dos minutos.',
      },
      url: 'https://app.dormetria.com',
      // Entrega a la hora local de cada persona.
      delayed_option: 'timezone',
      delivery_time_of_day: hora,
    };

    // OneSignal tiene dos generaciones de claves: la "Legacy API Key" se
    // autentica con Basic y las nuevas (v2) con Bearer. Probamos Basic y, si
    // rebota por credenciales, reintentamos con Bearer. Así funciona con
    // cualquiera de las dos sin que haya que saber cuál es cuál.
    const enviar = (esquema) => fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `${esquema} ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    try {
      let r = await enviar('Basic');
      if (r.status === 401 || r.status === 403) {
        console.log(`[${tag}] Basic rechazado, reintento con Bearer`);
        r = await enviar('Bearer');
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.errors) {
        console.error(`[${tag}] OneSignal respondió`, r.status, JSON.stringify(data));
        resultados.push({ tag, ok: false, detalle: data });
      } else {
        // recipients = a cuántas personas se les va a entregar
        console.log(`[${tag}] enviado · destinatarios: ${data.recipients}`);
        resultados.push({ tag, ok: true, destinatarios: data.recipients });
      }
    } catch (e) {
      console.error(`[${tag}] fallo de red`, e);
      resultados.push({ tag, ok: false, detalle: String(e) });
    }
  }

  return new Response(JSON.stringify(resultados), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// 12:00 UTC = 09:00 Argentina (UTC-3, sin horario de verano).
export const config = { schedule: '0 12 * * *' };
