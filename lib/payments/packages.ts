export type PaymentPackage = {
  package_code: string;
  name: string;
  credit_amount: number;
  amount_ars: number;
  currency: 'ARS';
  enabled: boolean;
};

// Commercial values remain intentionally undefined until Sebastián approves them.
// Keep disabled entries out of the public UI and reject them server-side too.
const PAYMENT_PACKAGES: readonly PaymentPackage[] = [
  // { package_code: 'pending-definition', name: 'Pendiente de definir', credit_amount: 0, amount_ars: 0, currency: 'ARS', enabled: false },
];

export function findPaymentPackage(packageCode: unknown): PaymentPackage | null {
  if (typeof packageCode !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(packageCode)) return null;
  const found = PAYMENT_PACKAGES.find(item => item.package_code === packageCode);
  return found?.enabled ? found : null;
}

export function listEnabledPaymentPackages() {
  return PAYMENT_PACKAGES.filter(item => item.enabled).map(({ package_code, name, credit_amount, amount_ars, currency }) => ({
    package_code, name, credit_amount, amount_ars, currency,
  }));
}
