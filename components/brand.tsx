export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="32" height="32" rx="8" fill="#0F766E" />
      <path
        d="M9 25V15C9 11 12.5 8.5 16 6C19.5 8.5 23 11 23 15V25H19V17C19 15.3 17.7 14 16 14C14.3 14 13 15.3 13 17V25Z"
        fill="#FAF6EE"
      />
      <rect x="7" y="24" width="18" height="2.5" rx="1" fill="#E8A317" />
    </svg>
  );
}
export function CollegeIllustration({
  className = "",
  alt = "",
  width = 280,
  height = 190,
}: {
  className?: string;
  alt?: string;
  width?: number;
  height?: number;
}) {
  return (
    // Decorative SVG served from /public; next/image adds nothing for a vector.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/illustrations/college.svg"
      alt={alt}
      width={width}
      height={height}
      className={className}
    />
  );
}
