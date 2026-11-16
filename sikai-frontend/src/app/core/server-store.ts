import { ApiTopic } from './api-models';

/** Flatten server curriculum for the player and progress screens without fabricated lesson IDs. */
export function curriculumLessons(topics: ApiTopic[]) { return topics.flatMap(topic => topic.lessons); }
