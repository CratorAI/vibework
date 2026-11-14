import extensions from './extensions.json';
/** Deliverable kinds shared with the Rust index; code/scratch viewers are excluded. */
export const isGalleryArtifact = (name: string) => extensions.some(ext => name.toLowerCase().endsWith(`.${ext}`));
