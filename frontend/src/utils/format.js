export const getCurrencyConfig = () => {
  try {
    const pref = localStorage.getItem('invoiceai_preferences');
    const currency = pref ? JSON.parse(pref).currency : 'INR';
    
    const currencyMap = {
      INR: { locale: 'en-IN', currency: 'INR' },
      USD: { locale: 'en-US', currency: 'USD' },
      EUR: { locale: 'de-DE', currency: 'EUR' },
      GBP: { locale: 'en-GB', currency: 'GBP' }
    };
    
    return currencyMap[currency] || { locale: 'en-IN', currency: 'INR' };
  } catch {
    return { locale: 'en-IN', currency: 'INR' };
  }
};

export const fmt = (n) => {
  const { locale, currency } = getCurrencyConfig();
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currency, maximumFractionDigits: 0 }).format(n || 0);
};

export const fmtDecimal = (n) => {
  const { locale, currency } = getCurrencyConfig();
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currency, maximumFractionDigits: 2 }).format(n || 0);
};
