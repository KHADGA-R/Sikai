import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { InstructorCourse, validateInstructorCourse } from './instructor-content';

@Injectable({ providedIn: 'root' })
export class InstructorContentService {
  private readonly auth = inject(AuthService);
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('learnhub-instructor', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('courses', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Unable to open upload storage. Allow browser storage and try again.'));
      request.onblocked = () => reject(new Error('Close other Sikai tabs and retry.'));
    });
  }
  private owner(): string {
    const user = this.auth.user();
    if (!user) throw new Error('Please log in to manage course content.');
    if (user.role !== 'instructor') throw new Error('Only instructors can manage course content.');
    return user.id;
  }
  async list(): Promise<InstructorCourse[]> {
    const ownerId = this.owner(); const db = await this.open();
    try {
      const records = await new Promise<InstructorCourse[]>((resolve, reject) => {
        const request = db.transaction('courses').objectStore('courses').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Unable to read saved courses.'));
      });
      return records.filter(c => c.ownerId === ownerId).sort((a,b) => b.updatedAt - a.updatedAt);
    } finally { db.close(); }
  }
  async save(course: InstructorCourse): Promise<void> {
    const ownerId = this.owner();
    if (course.ownerId !== ownerId) throw new Error('You can only change your own courses.');
    validateInstructorCourse(course);
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('courses', 'readwrite'); const store = tx.objectStore('courses');
        const get = store.get(course.id);
        get.onsuccess = () => {
          if (get.result && get.result.ownerId !== ownerId) { tx.abort(); return; }
          store.put({ ...course, updatedAt: Date.now() });
        };
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(new Error('Upload could not be saved. Check browser storage space and try again.'));
      });
    } finally { db.close(); }
  }
}
