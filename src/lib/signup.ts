import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

export type CountryOption = { code: CountryCode; name: string; dial: string };

// Countries for the sign-up dropdown, named in English and sorted by name.
export function countryOptions(): CountryOption[] {
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  return getCountries()
    .map((code) => ({ code, name: names.of(code) ?? code, dial: `+${getCountryCallingCode(code)}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const NAME = /^\p{L}[\p{L} .'-]{0,59}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Shared by the sign-up form and its API route, so the server never trusts the browser's checks.
export function validateSignup(input: Record<string, unknown>) {
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string).trim() : '');
  const firstName = text('firstName');
  const lastName = text('lastName');
  const country = text('country').toUpperCase();
  const email = text('email').toLowerCase();
  const password = typeof input.password === 'string' ? input.password : '';

  if (!NAME.test(firstName)) return { error: 'Enter a valid first name.' };
  if (!NAME.test(lastName)) return { error: 'Enter a valid last name.' };
  if (!(getCountries() as string[]).includes(country)) return { error: 'Choose your country.' };
  if (!EMAIL.test(email) || email.length > 254) return { error: 'Enter a valid email address.' };
  if (password.length < 8 || password.length > 128) return { error: 'Password must be 8 to 128 characters.' };

  const phone = parsePhoneNumberFromString(text('phone'), country as CountryCode);
  if (!phone || !phone.isValid()) return { error: 'Enter a valid phone number for the selected country.' };

  return {
    value: { firstName, lastName, name: `${firstName} ${lastName}`, country, email, password, phone: phone.format('E.164') },
  };
}
