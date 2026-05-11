import type { AuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { connectDB } from '@/lib/mongodb'
import { AuthorizedUser } from '@/lib/models'

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      await connectDB()
      const found = await AuthorizedUser.findOne({ email: user.email.toLowerCase() })
      console.log('[NextAuth signIn] email:', user.email, '| found:', !!found)
      return !!found
    },
    async session({ session }) {
      if (!session.user?.email) return session
      await connectDB()
      const found = await AuthorizedUser.findOne({ email: session.user.email.toLowerCase() })
      if (found) {
        ;(session.user as typeof session.user & { role: string }).role = found.role
      }
      return session
    },
  },
  pages: {
    signIn: '/',
    error: '/unauthorized',
  },
}
