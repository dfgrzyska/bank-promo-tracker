// ---------------------------------------------------------------------------
// Konfiguracja banków. Kolejny bank = kolejny obiekt w tablicy.
//
// kind: 'monthly' – te same warunki w kolejnych miesiącach (np. Erste)
//   months       – ile miesięcy trwa promocja
//   startOffset  – 1 = pierwszy miesiąc promocji to miesiąc po miesiącu wniosku
//   monthly      – warunki do spełnienia w każdym miesiącu
//   once         – warunki jednorazowe
//
// kind: 'plan' – jednorazowy plan krok po kroku z terminami (np. Pekao)
//   schedule     – terminy zależne od miesiąca umowy; w tekstach {klucz} → data
//   variants     – opcjonalne warianty; element z `variant` widać tylko w swoim
//   sections     – grupy kroków (`short` = nazwa zakładki);
//                  `optional: true` nie wlicza się do postępu
//   rewards      – nagrody przypisane do kroków (liczone po odhaczeniu)
//
// Typy elementów: 'check' (domyślny), 'count' (licznik do `target`),
// 'amount' (kwota do `target`), 'variant' (wybór wariantu).
// `deadline` to klucz z harmonogramu albo data RRRR-MM-DD; `soft` = „ok.”.
// ---------------------------------------------------------------------------
const BANKS = [
  {
    id: 'erste',
    kind: 'monthly',
    name: 'Erste Bank',
    promo: 'Konto Smart – do 700 zł',
    color: '#2870ed',
    url: 'https://www.erste.pl/ws-konto-smart-all/',
    startLabel: 'Miesiąc wniosku',
    months: 3,
    startOffset: 1,
    monthlyBonus: 200,
    finalBonus: 100,
    finalBonusLabel: 'za spełnienie warunków we wszystkich 3 miesiącach',
    once: [
      { id: 'wniosek', label: 'Wniosek i umowa konta z kartą debetową i Erste online', deadline: '2026-11-30' },
      { id: 'zgody', label: 'Zgoda na udział w promocji i akceptacja regulaminu' },
    ],
    monthly: [
      { id: 'wplyw', type: 'check', label: 'Wpływ min. 1000 zł', note: 'nie liczą się wpłaty gotówki ani przelewy z innego konta w Erste' },
      { id: 'platnosci', type: 'count', target: 7, label: 'Płatności kartą lub BLIKIEM', note: 'nie liczą się bankomaty ani przelewy na telefon BLIK' },
      { id: 'cel', type: 'check', label: 'Cel w Moje Cele', note: 'min. 1 cel, otwarty do dnia wypłaty nagrody' },
      { id: 'login', type: 'check', label: 'Logowanie do aplikacji mobilnej' },
    ],
  },
  {
    id: 'pekao',
    kind: 'plan',
    name: 'Pekao',
    promo: 'Karta z Żubrem – 22 000 mil',
    color: '#d4001a',
    url: 'https://www.pekao.com.pl/karta-z-zubrem/',
    contractLabel: 'Miesiąc umowy',
    // Terminy 1000 zł i mil – §6 regulaminu „Ekstra mile na start – edycja II”.
    schedule: {
      '2026-10': { label: 'Październik 2026', signBy: '2026-10-31', spend: '2026-11-30', milesFrom: '2026-12-15', milesTo: '2026-12-31' },
      '2026-11': { label: 'Listopad 2026', signBy: '2026-11-30', spend: '2026-12-31', milesFrom: '2027-01-15', milesTo: '2027-01-31' },
      '2026-12': { label: 'Grudzień 2026', signBy: '2026-12-31', spend: '2027-01-31', milesFrom: '2027-02-15', milesTo: '2027-02-28' },
      '2027-01': { label: '1–20 stycznia 2027', signBy: '2027-01-20', spend: '2027-02-28', milesFrom: '2027-03-15', milesTo: '2027-03-31' },
    },
    // Terminy orientacyjne z planu: wniosek tydzień przed umową, KŚP kilka dni
    // przed oknem naliczenia mil, zamknięcie do końca miesiąca po wpływie mil.
    derived: d => ({
      applyBy: addDays(d.signBy, -7),
      kspBy: addDays(d.milesFrom, -5),
      closeBy: endOfMonth(addDays(d.milesTo, 1)),
    }),
    variants: {
      A: { label: 'Mam', note: 'Wariant A: najpierw karta, Konto Świat Premium (KŚP) później.' },
      B: { label: 'Nie mam', note: 'Wariant B: najpierw KŚP (daje dostęp do Pekao24/PeoPay), potem karta.' },
    },
    rewards: [
      { item: 'powitalne', amount: 2000, unit: 'mil' },
      { item: 'mile20', amount: 20000, unit: 'mil' },
      { item: 'b-100', amount: 100, unit: 'zł', optional: true },
    ],
    keyDates: [
      { label: 'Wniosek o kartę z kodem MILE', date: 'applyBy', soft: true },
      { label: 'Podpisanie umowy o kartę', date: 'signBy' },
      { label: 'Karta w Miles & More + min. 1000 zł', date: 'spend' },
      { label: 'KŚP otwarte (wariant A)', date: 'kspBy', soft: true, variant: 'A' },
      { label: 'Wpływ 20 000 mil', date: 'milesFrom', to: 'milesTo' },
      { label: 'Spłata do zera, zamknięcie karty i KŚP', date: 'closeBy', soft: true },
    ],
    rules: [
      'Nagroda: 10 000 mil, albo 20 000 mil, jeśli w dniu naliczenia mil masz Konto Świat Premium (może być otwarte po karcie).',
      'Dodatkowo 2 000 mil powitalnych za pierwszą transakcję kartą już dołączoną do Miles & More.',
      'Warunek: karta dołączona do M&M i transakcje bezgotówkowe na min. 1000 zł w miesiącu umowy lub w następnym.',
      'Kto może: 18+, konsument, obywatelstwo PL i zamieszkanie w PL, dostęp do Pekao24/PeoPay, brak Karty z Żubrem od 1.01.2025 do 30.09.2026, brak Bankowości Prywatnej.',
      'Nie liczą się: kasyna, gry losowe, bukmacherka, loterie, zasilenia portfeli (Revolut, Skrill), przekazy pieniężne, transakcje anulowane/zwrócone, bankomaty.',
      'Utrata nagrody: wypowiedzenie lub odstąpienie od umowy o kartę albo wycofanie zgody na przetwarzanie danych przed otrzymaniem mil.',
      'Wyklucza się z „Obrączką w nagrodę” (kod OBRĄCZKA) – wybierz MILE.',
    ],
    links: [
      { label: 'Regulamin „Ekstra mile na start – edycja II”', url: 'https://www.pekao.com.pl/dam/ROOT-EXTERNAL/DOCS/Regulamin_promocji_Ekstra_mile_na_start_edycja_II.pdf' },
      { label: 'Regulamin „Zbieram mile z Kartą Kredytową z Żubrem”', url: 'https://www.pekao.com.pl/dam/jcr:d320598c-f61f-47d7-bdbb-6e9d3a175090/Regulamin_Programu_Zbieram_mile_z_Karta_Kredytowa_z_Zubrem.2026-07-01-11-36-18.pdf' },
      { label: 'Regulamin „Otwórz konto online i ruszaj po więcej – edycja IV”', url: 'https://www.pekao.com.pl/dam/ROOT-EXTERNAL/DOCS/Regulamin_promocji_Otworz_konto_online_i_ruszaj_po_wiecej.pdf' },
      { label: 'Karta z Żubrem – pakiety i opłaty', url: 'https://www.pekao.com.pl/karta-z-zubrem/' },
      { label: 'Okazja na Pepper.pl', url: 'https://www.pepper.pl/promocje/do-22000-mil-w-programe-miles-more-za-wyrobienie-karty-kredytowej-w-banku-pekao-1365502' },
      { label: 'Moneteo: Konto Świat Premium', url: 'https://moneteo.com/analizy/konto-swiat-premium-bank-pekao-sa' },
    ],
    sections: [
      {
        id: 'start', short: 'Start', title: 'Warunki i wariant',
        items: [
          { id: 'nozubr', label: 'Brak Karty Kredytowej z Żubrem od 1.01.2025 do 30.09.2026' },
          { id: 'nobp', label: 'Brak umowy Bankowości Prywatnej w Pekao' },
          { id: 'variant', type: 'variant', label: 'Dostęp do Pekao24/PeoPay' },
        ],
      },
      {
        id: 'card', short: 'Karta', title: 'Karta', sub: 'umowa: {contract}',
        items: [
          { id: 'ksp-b', variant: 'B', label: 'Otwórz Konto Świat Premium online', note: 'pekao.com.pl/konto-premium lub PeoPay „na selfie”' },
          { id: 'zgoda', label: 'Zgoda na informacje handlowe drogą elektroniczną', note: 'w Pekao24/PeoPay – warunek promocji' },
          { id: 'wniosek', label: 'Wniosek o Kartę Kredytową z Żubrem', note: 'złóż wcześniej, żeby zdążyć z decyzją kredytową', deadline: 'applyBy', soft: true },
          { id: 'kod', label: 'Kod promocyjny: MILE' },
          { id: 'pakiet', label: 'Pakiet Standard', note: '0 zł bezwarunkowo' },
          { id: 'oswiadczenia', label: '3 oświadczenia z załącznika do regulaminu zaakceptowane' },
          { id: 'umowa', label: 'Umowa o kartę podpisana', deadline: 'signBy' },
          { id: 'aktywacja', label: 'Karta aktywowana' },
          { id: 'mm', label: 'Karta dołączona do Miles & More – przed pierwszą płatnością', note: 'PeoPay → szczegóły karty → „Zbieraj mile Miles & More” → „Dołącz kartę” → rejestracja/logowanie na miles-and-more.com' },
          { id: 'mm-dane', label: 'Konto M&M na dane zgodne z dowodem', note: 'M&M bywa, że prosi o weryfikację przy wymianie mil' },
          { id: 'mm-ok', label: 'Komunikat o poprawnym dołączeniu karty' },
          { id: 'pierwsza', label: 'Pierwsza płatność kartą kredytową', note: '2 000 mil powitalnych w ok. 5 dni roboczych od zaksięgowania' },
          { id: 'powitalne', label: 'Wpłynęło 2 000 mil powitalnych', note: 'sprawdź w aplikacji Miles & More' },
        ],
      },
      {
        id: 'spend', short: '1000 zł', title: '1000 zł i KŚP', sub: 'do {spend}',
        items: [
          { id: 'kwota', type: 'amount', target: 1000, unit: 'zł', label: 'Transakcje kartą kredytową', note: 'Zrób zapas: ok. 1200 zł. Sumę sprawdzaj w historii karty w PeoPay. Transakcje z miesiąca umowy też się liczą. Nie liczą się m.in. kasyna, zakłady, zasilenia portfeli (Revolut, Skrill) i bankomaty.', deadline: 'spend' },
          { id: 'stop', label: 'Po ok. 1200 zł przestań używać karty', note: 'mniej transakcji = szybsze zamknięcie' },
          { id: 'splata', label: 'Spłata całości ręcznie kilka dni przed terminem z wyciągu', note: 'Bez odsetek (okres bezodsetkowy do 59 dni). Nie polegaj tylko na autospłacie – na Pepperze są zgłoszenia, że się nie wykonała.' },
          { id: 'ksp-a', variant: 'A', label: 'Otwórz Konto Świat Premium', note: 'KŚP musi istnieć w dniu naliczenia mil (od {milesFrom}).', deadline: 'kspBy', soft: true },
        ],
      },
      {
        id: 'miles', short: 'Mile', title: 'Wpływ mil', sub: '{milesFrom} – {milesTo}',
        note: 'Do wpływu mil nie wypowiadaj umowy o kartę, nie odstępuj od niej, nie wycofuj zgód i nie zamykaj KŚP.',
        items: [
          { id: 'mile20', label: 'Wpłynęło 20 000 mil na konto Miles & More', note: 'Sprawdź w aplikacji M&M, nie tylko w PeoPay. Jeśli mil nie ma do {milesTo} – reklamacja w Pekao (Pekao24, infolinia, oddział).', deadline: 'milesTo' },
        ],
      },
      {
        id: 'close', short: 'Zamykanie', title: 'Zamykanie', sub: 'po wpływie mil, najpóźniej ok. {closeBy}',
        note: 'Kolejność: najpierw spłata i wypowiedzenie karty (spłacasz z KŚP), potem zamknięcie KŚP.',
        items: [
          { id: 'zero', label: 'Karta spłacona do 0 zł', note: 'Poczekaj na zaksięgowanie wszystkich transakcji, sprawdź w PeoPay całe zadłużenie (nie tylko kwotę z wyciągu) i spłać do zera. Nadpłatę poproś o zwrot.' },
          { id: 'wypowiedz', label: 'Umowa o kartę wypowiedziana', note: 'Infolinia / oddział / Pekao24. Zapytaj o datę skuteczności (okres wypowiedzenia do 1 miesiąca) i poproś o potwierdzenie zamknięcia.', deadline: 'closeBy', soft: true },
          { id: 'zamknij-ksp', label: 'Konto Świat Premium zamknięte', note: 'Najlepiej w tej samej wizycie w oddziale (zamknięcie zwykle wymaga oddziału), w ramach 3 darmowych miesięcy.', deadline: 'closeBy', soft: true },
          { id: 'wygasniecie', label: 'Sprawdzona data wygaśnięcia mil na koncie M&M', note: 'Bez karty obowiązują zwykłe zasady M&M (zwykle 36 miesięcy). Od 10 000 mil bilet w dwie strony po Europie (LOT).' },
        ],
      },
      {
        id: 'bonus100', short: '+100 zł', title: 'Opcjonalnie: +100 zł', sub: '„Otwórz konto online i ruszaj po więcej – edycja IV”',
        variant: 'B', optional: true,
        note: 'Warunek: brak konta w Pekao od 1.09.2024 do 30.09.2026. Wypłata do 15.12.2026.',
        items: [
          { id: 'b-konto', label: 'KŚP otwarte online + tego samego dnia logowanie do Pekao24/PeoPay i zgody marketingowe', deadline: '2026-10-31' },
          { id: 'b-kolejnosc', label: 'Wniosek o kartę kredytową dopiero po otwarciu KŚP', note: 'w dniu przystąpienia nie możesz mieć produktu kredytowego' },
          { id: 'b-debet', label: '1 płatność kartą debetową do KŚP (nie BLIK)', note: 'w ciągu 14 dni od otwarcia konta' },
          { id: 'b-100', label: 'Wpłynęło 100 zł', deadline: '2026-12-15' },
        ],
      },
      {
        id: 'verify', short: 'Sprawdź', title: 'Do sprawdzenia w banku', sub: 'niepotwierdzone w oficjalnych dokumentach',
        optional: true,
        items: [
          { id: 'v-darmowy', label: 'Darmowy okres KŚP – czy miesiąc otwarcia jest bezpłatny?', note: 'wg źródeł zewnętrznych 3 pełne miesiące, potem ok. 50 zł/mies.' },
          { id: 'v-okres', label: 'Okres wypowiedzenia umowy o kartę i umowy KŚP' },
          { id: 'v-online', label: 'Czy kartę można wypowiedzieć online, czy tylko w oddziale / przez infolinię' },
        ],
      },
    ],
  },
];
