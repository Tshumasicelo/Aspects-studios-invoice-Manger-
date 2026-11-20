import type { Address } from '@/domain/types';
import { Field, Input } from '@/components/ui/Field';

export const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
];

export function AddressFields({ value, onChange, idPrefix }: { value: Address; onChange: (a: Address) => void; idPrefix: string }) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Street address" htmlFor={`${idPrefix}-l1`} className="sm:col-span-2">
        <Input id={`${idPrefix}-l1`} value={value.line1} onChange={set('line1')} autoComplete="address-line1" />
      </Field>
      <Field label="Suburb / unit (optional)" htmlFor={`${idPrefix}-l2`} className="sm:col-span-2">
        <Input id={`${idPrefix}-l2`} value={value.line2} onChange={set('line2')} autoComplete="address-line2" />
      </Field>
      <Field label="City" htmlFor={`${idPrefix}-city`}>
        <Input id={`${idPrefix}-city`} value={value.city} onChange={set('city')} autoComplete="address-level2" />
      </Field>
      <Field label="Province" htmlFor={`${idPrefix}-prov`}>
        <Input id={`${idPrefix}-prov`} list="sa-provinces" value={value.province} onChange={set('province')} autoComplete="address-level1" />
        <datalist id="sa-provinces">
          {SA_PROVINCES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>
      <Field label="Postal code" htmlFor={`${idPrefix}-pc`}>
        <Input id={`${idPrefix}-pc`} value={value.postalCode} onChange={set('postalCode')} autoComplete="postal-code" inputMode="numeric" />
      </Field>
      <Field label="Country" htmlFor={`${idPrefix}-country`}>
        <Input id={`${idPrefix}-country`} value={value.country} onChange={set('country')} autoComplete="country-name" />
      </Field>
    </div>
  );
}
