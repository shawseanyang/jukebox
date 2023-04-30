import { Avatar, List } from "antd";
import { Artist, Song } from "../types/Music";
import { formatArtistsNames } from "../util/musicUtil";
import Ellipsis from "./Ellipsis";

// Renders a song into a list item
export type SongListItemProps = {
  song: Song;
};

const SongListItem = (props: SongListItemProps) =>
<List.Item.Meta
  avatar={
    <Avatar shape="square" size="large" src={props.song.album.imageUrl} />
  }
  title={<Ellipsis.Title text={props.song.name} level={3} />}
  description={<Ellipsis.Text text={formatArtistsNames(props.song.artists)} />}
/>
export default SongListItem;