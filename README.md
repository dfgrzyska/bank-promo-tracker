# bank-promo-tracker

Strona mobilna (w stylu iOS) do odhaczania warunków promocji bankowych.
Stan trzymany jest w `localStorage` przeglądarki (bez backendu).

| Plik | Co zawiera |
|---|---|
| `banks.js` | konfiguracja banków i warunków promocji |
| `app.js` | logika i widoki |
| `styles.css` | wygląd |
| `sw.js` | działanie offline |

## Hosting (GitHub Pages)

Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`.
Strona będzie pod adresem `https://<user>.github.io/bank-promo-tracker/`.

### iPhone

Safari → Udostępnij → „Do ekranu początkowego” i otwieraj stronę tylko z ikony:

- Safari kasuje dane stron nieodwiedzanych przez 7 dni; aplikacja z ekranu
  początkowego nie podlega temu limitowi.
- Aplikacja z ekranu początkowego ma **osobne** dane niż Safari – to, co
  odhaczysz w Safari, nie przeniesie się do niej.
- „Eksportuj kopię” otwiera arkusz udostępniania („Zachowaj w Plikach”),
  „Importuj kopię” wczytuje plik JSON z Plików.
- `sw.js` pozwala otworzyć stronę bez internetu (po pierwszym uruchomieniu).

## Dodanie banku

Dopisz obiekt do tablicy `BANKS` w `banks.js`. Są dwa typy promocji:

- `kind: 'monthly'` – te same warunki co miesiąc (przykład poniżej, oraz Erste),
- `kind: 'plan'` – jednorazowy plan krok po kroku z terminami liczonymi
  z miesiąca umowy i wariantami (wzór: Pekao w `banks.js`).

```js
{
  id: 'mbank',
  kind: 'monthly',
  name: 'mBank',
  promo: 'Opis promocji',
  color: '#c8102e',
  url: 'https://…',
  startLabel: 'Miesiąc otwarcia konta',
  months: 3,          // ile miesięcy trwa promocja
  startOffset: 1,     // 1 = liczymy od miesiąca po miesiącu startu, 0 = od tego samego
  monthlyBonus: 100,
  finalBonus: 0,
  once: [ { id: 'umowa', label: 'Otwarcie konta' } ],
  monthly: [
    { id: 'wplyw', type: 'check', label: 'Wpływ min. 1000 zł' },
    { id: 'blik', type: 'count', target: 5, label: 'Płatności BLIK' },
  ],
}
```
