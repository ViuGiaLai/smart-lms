import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const backendUrl = (
            process.env.BACKEND_INTERNAL_URL ||
            process.env.NEXT_PUBLIC_API_URL ||
            'http://localhost:8000'
          ).replace(/\/api\/v1\/?$/, '');

          const res = await fetch(`${backendUrl}/api/v1/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ email: credentials.email, password: credentials.password }),
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!res.ok) return null;

          const data = await res.json();
          const authData = data.data || data;
          const user = authData.user;
          if (!user || (!authData.accessToken && !authData.access_token)) return null;
          return {
            id: String(user.id),
            name: user.name || user.fullName || credentials.email.split('@')[0],
            email: user.email || credentials.email,
            role: user.role || 'student',
            accessToken: authData.accessToken || authData.access_token,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.accessToken = (user as any).accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).accessToken = token.accessToken;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET || 'smart_lms_super_secret_jwt_key_2026',
};
