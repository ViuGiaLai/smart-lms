'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { coursesApi } from '@/lib/api'
import { Course, CourseFilters, CourseProgress } from '@/types'

// ===== Query Keys =====
export const courseKeys = {
  all: ['courses'] as const,
  lists: () => [...courseKeys.all, 'list'] as const,
  list: (filters: CourseFilters) => [...courseKeys.lists(), filters] as const,
  details: () => [...courseKeys.all, 'detail'] as const,
  detail: (id: string) => [...courseKeys.details(), id] as const,
  progress: (courseId: string) => [...courseKeys.all, 'progress', courseId] as const,
  enrolled: () => [...courseKeys.all, 'enrolled'] as const,
}

// ===== Hooks =====

export function useCourses(filters: CourseFilters = {}) {
  return useQuery({
    queryKey: courseKeys.list(filters),
    queryFn: async () => {
      const response = await coursesApi.list(filters as Record<string, unknown>)
      return response.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useCourse(idOrSlug: string) {
  return useQuery({
    queryKey: courseKeys.detail(idOrSlug),
    queryFn: async () => {
      const response = await coursesApi.getBySlug(idOrSlug)
      return response.data.data as Course
    },
    enabled: !!idOrSlug,
    staleTime: 3 * 60 * 1000,
  })
}

export function useCourseProgress(courseId: string) {
  return useQuery({
    queryKey: courseKeys.progress(courseId),
    queryFn: async () => {
      const response = await coursesApi.getProgress(courseId)
      return response.data.data as CourseProgress
    },
    enabled: !!courseId,
    refetchInterval: 30 * 1000, // Refetch every 30 seconds during learning
  })
}

export function useEnrolledCourses() {
  return useQuery({
    queryKey: courseKeys.enrolled(),
    queryFn: async () => {
      const response = await coursesApi.getEnrolled()
      return response.data.data
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useEnrollCourse() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (courseId: string) => {
      const response = await coursesApi.enroll(courseId)
      return response.data
    },
    onSuccess: (_, courseId) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: courseKeys.enrolled() })
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(courseId) })
    },
  })
}

export function useMarkLessonComplete() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      courseId,
      lessonId,
      watchedSeconds,
    }: {
      courseId: string
      lessonId: string
      watchedSeconds: number
    }) => {
      const response = await coursesApi.markLessonComplete(courseId, lessonId, watchedSeconds)
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: courseKeys.progress(variables.courseId) })
    },
  })
}
