# Documento de Requisitos de Producto (PRD): Mensaje al Alma (MVP)

## 1. Visión General del Producto y Propuesta de Regalo
- **Nombre del Proyecto:** Mensaje al Alma (Nombre conceptual/interno).
- **Propósito:** Proveer una plataforma web minimalista, cálida y directa para dejar mensajes pendientes, saludos o memorias esenciales para seres queridos. Se enfoca en el plano emocional puro (agradecimientos, distancia, cumpleaños, afectos o despedidas) sin la complejidad burocrática de testamentos legales o herramientas corporativas pesadas.
- **Estrategia de Adquisición (Viralidad e Inmediatez):** 
  - Los primeros **3 mensajes/saludos** (cumpleaños, afectos) son 100% gratuitos por email para romper la barrera de entrada.
  - Incorporación del modelo **"Regalar un Mensaje al Alma"** (inspirado en referencias de mercado como Almaya), permitiendo enviar una tarjeta digital de invitación a un ser querido para que comience a utilizar la plataforma.

---

## 2. Arquitectura de Contenidos: La Landing Page en 6 Bloques
Para garantizar una experiencia dinámica y evitar textos largos que generen fatiga en el usuario, la página principal se estructurará exactamente en 6 bloques:

1. **Bloque 1: Hero Section (El Gancho Emocional)**
   - Título cálido ("Palabras pendientes que siempre quisiste decir"), subtítulo breve y llamada a la acción principal: "Regalá tus primeros 3 mensajes gratis".
2. **Bloque 2: Cómo Funciona (En 3 Pasos)**
   - Explicación visual con íconos limpios: 
     1. Elegís al destinatario.
     2. Escribís o grabás un audio/video corto.
     3. Lo enviás ahora o lo guardás.
3. **Bloque 3: La Experiencia de Regalo**
   - Sección dedicada a regalar la plataforma a un familiar o amigo para una fecha especial, generando una invitación directa.
4. **Bloque 4: Ejemplos y Formatos**
   - Tarjetas interactivas breves que muestran los formatos admitidos (Texto, Audio corto, Video breve y Fotos).
5. **Bloque 5: Confianza y Seguridad**
   - Mensaje sobrio sobre la privacidad, el resguardo de los datos y el control absoluto del usuario sobre sus mensajes.
6. **Bloque 6: Footer y Cierre**
   - Botón final para comenzar, enlaces legales básicos (Privacidad y Términos) y soporte.

---

## 3. Especificaciones Técnicas y Stack Tecnológico
- **Frontend:** Next.js (App Router) con React y TypeScript para asegurar velocidad de carga instantánea y rendimiento móvil óptimo.
- **Estilos UI:** Tailwind CSS, utilizando una paleta de colores basada en tonos marfil suave, grises perla y arenas claras (modo claro) junto a tonos noche profundos (modo oscuro), evitando blancos deslumbrantes para transmitir paz.
- **Backend y Base de Datos:** Supabase (Postgres + Auth) con políticas de seguridad estrictas a nivel de filas (Row Level Security - RLS) para asegurar el aislamiento total de los mensajes de cada usuario.
- **Almacenamiento Multimedia:** Supabase Storage para audios, imágenes y videos cortos comprimidos.
- **Envío de Correos:** Resend, para procesar los emails transaccionales de bienvenida y las invitaciones de regalo de forma inmediata y segura.

---

## 4. Apéndice Técnico / Guía de Diseño y Psicología

# Guía de Diseño, Psicología y Experiencia de Usuario - Mensaje al Alma

## 1. Psicología del Usuario y Reducción de Fricción
- El usuario promedio de esta plataforma puede estar atravesando momentos de sensibilidad, distancia o enfermedad. La interfaz jamás debe apurar, abrumar ni exigir textos extensos.
- Se priorizan las "puertas de entrada" suaves: preguntas guía sencillas y la opción de alternar entre texto y audio con un solo toque.
- El sistema otorga control total: el usuario puede pausar, editar o eliminar borradores en cualquier momento sin penalizaciones.

## 2. Criterios de Accesibilidad y Paz Visual
- Tipografías sans-serif de trazos limpios, con tamaños de lectura generosos y espacios en blanco (whitespace) amplios.
- Cero elementos flotantes agresivos, notificaciones emergentes estridentes o colores de alerta chillones (se priorizan verdes oliva suaves y tonos ámbar cálidos para acciones).
- Textos de interfaz empáticos: los mensajes de error o estados vacíos deben redactarse con calidez humana y lenguaje claro, evitando tecnicismos fríos de programación.

## 3. Control de Costos y Almacenamiento Multimedia
- Para mantener la viabilidad técnica del prototipo en Vercel y evitar costos excesivos de almacenamiento en la nube, los videos de los planes gratuitos o de bienvenida tienen límites estrictos de duración (máximo 30-45 segundos y compresión automática). Los videos largos y de alta definición quedan reservados para fases comerciales posteriores.
