import { Skeleton, Image } from "antd";

export type AlbumCoverProps = {
  imageUrl: string | null;
};

const AlbumCover = (props: AlbumCoverProps) => {
  return (
    props.imageUrl
    ? <Image src={props.imageUrl} alt="album cover"/>
    : <Skeleton.Image />
  )
}

export default AlbumCover;