// Turns an ISO timestamp into a short "N{m,h,d} ago" string for deploy times.
export function relativeTime(iso: string, now: Date = new Date()): string {
	const sec = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
	if (sec < 60) return "just now";
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	return `${Math.floor(hr / 24)}d ago`;
}
