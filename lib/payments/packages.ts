export type PaymentPackage = {
  package_code: string;
  name: string;
  credit_amount: number;
  amount_ars: number;
  currency: 'ARS';
  enabled: boolean;
};

export const PAYMENT_PACKAGES: PaymentPackage[] = [
  {
    package_code: 'pack_texto_1',
    name: 'Mensaje de Texto',
    credit_amount: 1,
    amount_ars: 2000,
    currency: 'ARS',
    enabled: true,
  },
  {
    package_code: 'pack_audio_1',
    name: 'Mensaje con Audio y Texto',
    credit_amount: 1,
    amount_ars: 3000,
    currency: 'ARS',
    enabled: true,
  },
  {
    package_code: 'pack_fotos_1',
    name: 'Mensaje con Fotos y Texto',
    credit_amount: 1,
    amount_ars: 4000,
    currency: 'ARS',
    enabled: true,
  },
  {
    package_code: 'pack_video_45s_1',
    name: 'Mensaje en Video (hasta 45s) y Texto',
    credit_amount: 1,
    amount_ars: 5000,
    currency: 'ARS',
    enabled: true,
  },
  {
    package_code: 'pack_video_15m_1',
    name: 'Mensaje en Video Extendido (hasta 15 min) y Texto',
    credit_amount: 1,
    amount_ars: 45000,
    currency: 'ARS',
    enabled: true,
  },
];

export function findPaymentPackage(packageCode: unknown): PaymentPackage | null {
  if (typeof packageCode !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(packageCode)) return null;
  const found = PAYMENT_PACKAGES.find(item => item.package_code === packageCode);
  return found?.enabled ? found : null;
}

export function listEnabledPaymentPackages() {
  return PAYMENT_PACKAGES.filter(item => item.enabled).map(({ package_code, name, credit_amount, amount_ars, currency }) => ({
    package_code, name, credit_amount, amount_ars, currency,
  }));
}
