# Mercado Pago local — etapa preparada

Esta etapa prepara Checkout Pro sin activar productos comerciales, sin crear preferencias y sin tocar Production.

## Paquetes

La configuración server-side está en `lib/payments/packages.ts`. No contiene precios, cantidades ni paquetes activos. Un `package_code` sólo puede resolverse en el servidor y los paquetes deshabilitados se rechazan tanto en la API como en cualquier futura interfaz.

## Cuota futura

La migración `supabase/migrations/202610190006_payment_orders.sql` crea órdenes y grants de créditos comprados, pero no modifica `message_quota_limit()` ni `get_message_quota()`.

Cuando la migración sea revisada y aplicada de forma autorizada, esas funciones deberán calcular:

```text
cuota base + créditos manuales activos + créditos comprados activos
```

La reserva actual de `message_send_attempts` y `message_schedules` seguirá siendo la única operación que consume un envío. No se debe insertar ni actualizar `message_development_credits` para representar compras.

## Estado de integración

- `POST /api/payments/checkout` requiere un paquete habilitado, por lo que actualmente no puede crear una preferencia.
- `POST /api/mercadopago/webhook` valida `x-signature`, consulta el pago server-side y delega la reconciliación a `reconcile_payment_order`.
- La RPC de reconciliación acredita una única vez mediante `message_credit_grants`, pero no existe en Production porque la migración no fue aplicada.
- El transporte server-side usa `mercadopago@3.2.1`: `MercadoPagoConfig`, `Preference.create`, `Payment.get` y `WebhookSignatureValidator`. No se inicializa desde componentes de navegador.

## Variables esperadas

```text
MP_ACCESS_TOKEN
MP_WEBHOOK_SECRET
MP_NOTIFICATION_URL
NEXT_PUBLIC_APP_URL
```

No se guardaron valores reales ni ficticios en el proyecto.
