export const COURSE_CATEGORIES = [
  { name: 'Culture & Heritage', image: 'nepal-heritage', subcategories: ['Festivals & Traditions', 'History', 'Religion & Philosophy', 'Food & Cuisine', 'Ethnic Communities', 'Cultural Heritage'] },
  { name: 'Music', image: 'nepali-music', subcategories: ['Traditional Music', 'Folk Music', 'Musical Instruments', 'Singing & Vocals', 'Modern Music', 'Music Production'] },
  { name: 'Dance & Performing Arts', image: 'nepali-dance', subcategories: ['Traditional Dance', 'Folk Dance', 'Classical Dance', 'Modern Dance', 'Choreography', 'Theater & Acting'] },
  { name: 'Arts & Crafts', image: 'thangka-art', subcategories: ['Traditional Arts', 'Painting & Drawing', 'Handicrafts', 'Pottery & Sculpture', 'Textile & Fashion', 'Digital Arts'] },
  { name: 'Languages', image: 'nepali-language', subcategories: ['Nepali', 'Indigenous & Regional Languages', 'English', 'Foreign Languages', 'Language for Kids', 'Translation & Literature'] },
  { name: 'Skills & Training', image: 'online-learning', subcategories: ['IT & Technology', 'Business & Entrepreneurship', 'Digital Marketing', 'Creative Skills', 'Career Development', 'Vocational Training'] }
] as const;
export type Category = typeof COURSE_CATEGORIES[number]['name'];
export const CATEGORY_NAMES: readonly Category[] = COURSE_CATEGORIES.map(c => c.name);
export function subcategoriesFor(category: string): readonly string[] {
  return COURSE_CATEGORIES.find(c => c.name === category)?.subcategories ?? [];
}
export function validClassification(category: string, subcategory?: string): boolean {
  return CATEGORY_NAMES.includes(category as Category) && (!subcategory || subcategoriesFor(category).includes(subcategory));
}
/** Reclassify older demo records without changing their IDs or content. */
export function migrateCategory<T>(record: T): T {
  if (!record || typeof record !== 'object' || !('category' in record)) return record;
  const legacy: Record<string, { category: Category; subcategory: string }> = {
    Development: { category: 'Skills & Training', subcategory: 'IT & Technology' },
    'Data Science': { category: 'Skills & Training', subcategory: 'IT & Technology' },
    Business: { category: 'Skills & Training', subcategory: 'Business & Entrepreneurship' },
    Design: { category: 'Arts & Crafts', subcategory: 'Digital Arts' }
  };
  const replacement = typeof record.category === 'string' ? legacy[record.category] : undefined;
  return replacement ? { ...record, ...replacement } : record;
}
