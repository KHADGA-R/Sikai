import type { Course } from './models';

export const SCHOOL_GRADES = Array.from({ length: 12 }, (_, index) => index + 1);
export const GRADE_GROUPS = [
  { name: 'Primary', description: 'Build strong foundations', grades: SCHOOL_GRADES.slice(0, 5) },
  { name: 'Lower Secondary', description: 'Explore and grow', grades: SCHOOL_GRADES.slice(5, 8) },
  { name: 'Secondary', description: 'Prepare for the next step', grades: SCHOOL_GRADES.slice(8, 10) },
  { name: 'Higher Secondary', description: 'Go further with confidence', grades: SCHOOL_GRADES.slice(10, 12) },
];

export function validGrade(grade: unknown): grade is number | undefined {
  return grade === undefined || (typeof grade === 'number' && Number.isInteger(grade) && grade >= 1 && grade <= 12);
}

export function isAcademicCourse(course: Pick<Course, 'category'>): boolean {
  return course.category === 'K–12 Maths' || course.category === 'SEE Preparation';
}

export function matchesSchoolGrade(course: Pick<Course, 'category' | 'grade'>, grade: number | 'All'): boolean {
  return isAcademicCourse(course) && (grade === 'All' || course.grade === grade);
}
