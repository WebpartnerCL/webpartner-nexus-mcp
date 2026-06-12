-- ============================================================================
-- seed_site_webpartner.sql — contenido del sitio agéntico de WebPartner (tenant #1)
-- Idempotente: actualiza sitio_contenido del tenant slug='webpartner'.
-- Espejo de src/lib/fixtures.ts (webpartner-site). Mantener ambos en sync.
-- ⚠️ Reemplazar los números +56985865420 por los reales de WebPartner.
-- ============================================================================

update public.clientes
set
  nombre_negocio = 'WebPartner',
  rubro          = coalesce(rubro, 'Agencia de IA'),
  cal_url        = coalesce(cal_url, 'https://cal.com/mauricio-allendes-us6mik/45min'),
  sitio_contenido = $${
  "mode": "agency",
  "tema": {
    "brand": "#0A84FF", "brandFg": "#ffffff", "bg": "#ffffff",
    "fg": "#0b0b0f", "muted": "#6e6e73", "surface": "#f5f5f7", "border": "#e6e6eb"
  },
  "marca": { "logoAlt": "WebPartner" },
  "canales": {
    "whatsappE164": "+56985865420",
    "whatsappMensaje": "Hola WebPartner, quiero una web agéntica para mi negocio.",
    "telefonoE164": "+56985865420"
  },
  "seo": {
    "title": "WebPartner — Tu web que vende sola, 24/7",
    "description": "Creamos sitios web agénticos que capturan, califican y agendan tus clientes automáticamente por WhatsApp, llamada y formulario. Listo en 48 horas."
  },
  "bantLite": [
    { "id": "rubro", "label": "¿A qué se dedica tu negocio?", "tipo": "text", "requerida": true },
    { "id": "urgencia", "label": "¿Para cuándo lo necesitas?", "tipo": "select", "opciones": ["Lo antes posible", "Este mes", "Solo estoy cotizando"], "requerida": false }
  ],
  "secciones": [
    { "tipo": "hero", "titulo": "Tu sitio web que vende solo, las 24 horas.",
      "subtitulo": "No es una web bonita y muda: es una máquina de ventas. Captura, califica y agenda a tus clientes por WhatsApp, llamada y formulario — automáticamente.",
      "ctaPrimario": { "label": "Quiero la mía", "accion": { "tipo": "form" } },
      "ctaSecundario": { "label": "Agendar demo", "accion": { "tipo": "agendar" } } },
    { "tipo": "trustbar", "items": ["Listo en 48 horas", "Atención 24/7 con IA", "Agenda + WhatsApp + Llamada", "Desde USD 108"] },
    { "tipo": "servicios", "titulo": "Cada botón de tu web es un vendedor",
      "subtitulo": "Todos los caminos llevan a una conversión. Tu cliente nunca queda sin respuesta.",
      "items": [
        { "titulo": "Agente de WhatsApp", "descripcion": "Un asistente con IA conversa, responde dudas, califica al interesado y lo agenda — sin que tú muevas un dedo." },
        { "titulo": "Formulario que califica", "descripcion": "Captura los datos y, con IA, prioriza a los clientes con más intención de compra. Tú solo atiendes a los buenos." },
        { "titulo": "Agendamiento directo", "descripcion": "El cliente reserva una reunión o visita en tu calendario en segundos. Cero ida y vuelta." },
        { "titulo": "Click para llamar", "descripcion": "Un botón persistente en el móvil conecta la llamada al instante, cuando la intención está caliente." },
        { "titulo": "Todo en tu CRM", "descripcion": "Cada contacto queda registrado y ordenado automáticamente. Nada se pierde en un cuaderno." },
        { "titulo": "Métricas reales", "descripcion": "Reporte mensual de visitas, clientes recibidos y agendados. Sabes exactamente qué te trae la web." }
      ] },
    { "tipo": "testimonios", "titulo": "Negocios que ya venden en automático",
      "items": [
        { "nombre": "Carlos M.", "cargo": "Taller mecánico", "texto": "Antes perdía clientes que escribían fuera de horario. Ahora el agente responde a cualquier hora y me los agenda solos.", "rating": 5 },
        { "nombre": "Daniela R.", "cargo": "Centro estético", "texto": "La web me llegó en dos días y empezó a captar reservas la primera semana. Increíble.", "rating": 5 },
        { "nombre": "Jorge P.", "cargo": "Restaurante", "texto": "El botón de WhatsApp con IA contesta las preguntas de siempre y me deja libre para atender el local.", "rating": 5 }
      ] },
    { "tipo": "faq", "titulo": "Preguntas frecuentes",
      "items": [
        { "pregunta": "¿En cuánto tiempo está lista mi web?", "respuesta": "En 48 horas hábiles desde que confirmas y nos pasas tu logo, fotos y datos de contacto." },
        { "pregunta": "¿Qué incluye el precio?", "respuesta": "Sitio agéntico completo (agendamiento, WhatsApp con IA, click-to-call y formulario que califica), hosting, analítica y soporte. USD 108 de instalación y USD 108 al mes." },
        { "pregunta": "¿Necesito saber de tecnología?", "respuesta": "Para nada. Nosotros lo montamos, lo conectamos a tus herramientas y te lo entregamos funcionando." },
        { "pregunta": "¿Puedo pedir cambios después?", "respuesta": "Sí. La mantención mensual incluye cambios menores y soporte por WhatsApp." }
      ] },
    { "tipo": "formulario", "titulo": "Pide tu web agéntica", "subtitulo": "Déjanos tus datos y te contactamos por WhatsApp en minutos." },
    { "tipo": "agenda", "titulo": "O agenda una demo de 45 minutos", "subtitulo": "Te mostramos en vivo cómo vendería tu web." },
    { "tipo": "ctaFinal", "titulo": "Tu competencia ya está respondiendo 24/7. ¿Y tú?",
      "subtitulo": "Instalación desde USD 108. Lista en 48 horas. Sin letra chica.",
      "cta": { "label": "Quiero la mía", "accion": { "tipo": "form" } } }
  ],
  "legal": { "empresa": "WebPartner", "email": "webpartner33@gmail.com" }
}$$::jsonb
where slug = 'webpartner';
