// ВАЖНО: это копия CATS_EXP / CAT_KEYWORDS из index.html для использования на бэкенде
// (там это ES-модуль в браузере, здесь — CommonJS для Node/Netlify Functions).
// При изменении категорий или словаря — правьте ОБА места.

const CATS_EXP = [
  { ico: '🛒', lbl: 'Еда' },
  { ico: '🏠', lbl: 'Жильё' },
  { ico: '🚗', lbl: 'Транспорт' },
  { ico: '☕', lbl: 'Кафе' },
  { ico: '💊', lbl: 'Здоровье' },
  { ico: '🎮', lbl: 'Развлечения' },
  { ico: '👕', lbl: 'Одежда и уход' },
  { ico: '📱', lbl: 'Связь' },
  { ico: '🧾', lbl: 'Услуги' },
  { ico: '✈️', lbl: 'Путешествия' },
  { ico: '🎓', lbl: 'Образование' },
  { ico: '📦', lbl: 'Другое' }
];

const CAT_KEYWORDS = {
  '🛒': ['biedronka','lidl','żabka','zabka','carrefour','auchan','kaufland','netto','dino','stokrotka','пятерочка','магнит','ашан','перекресток','вкусвилл','супермаркет','продукты','grocery','market'],
  '🏠': ['czynsz','komunalne','czynsz najmu','аренда','квартплата','коммуналка','электричество','tauron','pgnig','rent','utilities'],
  '🚗': ['uber','bolt','taxi','yandex','такси','paliwo','benzyna','orlen','bp','shell','circle k','metro','bus','автобус','заправка','парковка','parking','fuel'],
  '☕': ['starbucks','kawiarnia','restauracja','mcdonald','kfc','burger king','costa','кафе','ресторан','кофейня','coffee','restaurant','pizza','sushi','lodziarnia','lody','мороженое'],
  '💊': ['apteka','pharmacy','аптека','клиника','dentist','стоматолог','лекарства','doctor','clinic','лекарство','ziko','dbam o zdrowie'],
  '🎮': ['netflix','spotify','cinema city','multikino','kino','кино','концерт','playstation','steam','xbox','game','подписка','hbo','youtube premium'],
  '👕': ['zara','h&m','reserved','cropp','mohito','house','sinsay','одежда','обувь','clothes','shoes','nike','adidas','fryzjer','salon fryzjerski','stylistka','barber','fryzura','стрижка','парикмахер','салон красоты','маникюр','manicure','paznokcie','kosmetyczka','барбершоп'],
  '📱': ['orange','play','t-mobile','plus','internet','telefon','wifi','wi-fi','роуминг','tele2','netia','связь','мобильный','tanio dzwoni'],
  '🧾': ['urząd','urzad','ministerstwo','sąd','sad','opłaty','oplaty','oplaty.ms.gov.pl','podatek','zus','налог','пошлина','госпошлина','hosting','home.pl','godaddy','ovh','domena','księgowość','ksiegowosc','бухгалтер','услуги','abonament','нотариус'],
  '✈️': ['booking.com','airbnb','ryanair','wizzair','wizz air','lot.com','отель','hotel','авиабилет','samolot','lotnisko','аэропорт','pkp','поезд','отпуск','vacation','flight','билет на самолет'],
  '🎓': ['kurs','szkolenie','udemy','coursera','курс','обучение','учебник','szkoła','szkola','uczelnia','czesne','книга','book','skillbox','лекция']
};

const CATS_INC = [
  { ico: '💼', lbl: 'Зарплата' },
  { ico: '🎁', lbl: 'Подарок' },
  { ico: '📈', lbl: 'Инвестиции' },
  { ico: '🏦', lbl: 'Перевод' },
  { ico: '💡', lbl: 'Фриланс' },
  { ico: '🏠', lbl: 'Аренда' },
  { ico: '📦', lbl: 'Продажа' },
  { ico: '✨', lbl: 'Другое' }
];

function guessCategory(text, type) {
  if (!text || type !== 'expense') return null;
  const t = text.toLowerCase();
  for (const [ico, words] of Object.entries(CAT_KEYWORDS)) {
    if (words.some(w => t.includes(w))) return ico;
  }
  return null;
}

module.exports = { CATS_EXP, CATS_INC, CAT_KEYWORDS, guessCategory };
