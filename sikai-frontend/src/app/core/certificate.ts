export interface Certificate {
  id: string;
  recipient: string;
  courseTitle: string;
  issuedAt: number;
  instructor?: string | null;
  durationHours?: number | null;
  level?: string | null;
  completedAt?: number | null;
}

export interface OwnedCertificate extends Certificate {
  courseId: number;
  shared: boolean;
}
