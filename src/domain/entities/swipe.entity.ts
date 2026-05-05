export type SwipeDirection = 'LIKE' | 'DISLIKE'

export interface Swipe {
  id: string
  candidateId: string
  jobId: string
  direction: SwipeDirection
  swipedAt: Date
}
