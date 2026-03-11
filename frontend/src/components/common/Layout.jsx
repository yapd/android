import Sidebar from './Sidebar'

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-farm-bg">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
