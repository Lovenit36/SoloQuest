import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'SoloQuest · Find your kind of day',description:'Start alone. Connect naturally. Explore freely. Your personal city companion, with real places and shared moments.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
