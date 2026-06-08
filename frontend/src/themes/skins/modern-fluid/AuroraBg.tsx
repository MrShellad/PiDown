

export default function AuroraBg() {
  return (
    <div className="fixed inset-0 overflow-hidden -z-50 bg-[var(--theme-static-background)]">
      {/* Aurora blur blobs */}
      <div 
        className="absolute w-[80vw] h-[80vw] rounded-full blur-[120px] opacity-30 animate-pulse pointer-events-none"
        style={{
          background: "radial-gradient(circle, var(--aurora-blob-primary) 0%, transparent 70%)",
          top: "-20vw",
          left: "-20vw",
          animationDuration: "8s",
        }}
      />
      <div 
        className="absolute w-[70vw] h-[70vw] rounded-full blur-[100px] opacity-20 animate-pulse pointer-events-none"
        style={{
          background: "radial-gradient(circle, var(--aurora-blob-secondary) 0%, transparent 70%)",
          bottom: "-10vw",
          right: "-10vw",
          animationDuration: "12s",
        }}
      />
      <div 
        className="absolute w-[60vw] h-[60vw] rounded-full blur-[90px] opacity-15 pointer-events-none"
        style={{
          background: "radial-gradient(circle, var(--aurora-blob-tertiary) 0%, transparent 70%)",
          top: "30vh",
          left: "25vw",
        }}
      />
    </div>
  );
}
