import { Avatar, List, Row, Skeleton } from "antd";
import { Artist, Song } from "../types/Music";
import Title from "antd/es/typography/Title";
import CenteredTitle from "./CenteredTitle";
import SongListItem from "./SongListItem";
import { deleteSong } from "../types/Playback";
import LoadableButton from "./LoadableButton";

export type QueueViewerProps = {
  queue: Song[];
  deleteSong: deleteSong;
};

const DeleteButton = (props: {index: number, deleteSong: deleteSong}) => {
  return (
    <LoadableButton
      args={[props.index]}
      callback={props.deleteSong}
      buttonProps={{type: "link"}}
    >
      Delete
    </LoadableButton>
  )
}

const QueueViewer = (props: QueueViewerProps) => {

  function isQueueEmpty() {
    return props.queue.length === 0;
  }

  const SkeletonQueue =
    <List
      itemLayout="horizontal"
      dataSource={[1, 2, 3]}
      renderItem={() => (
        <List.Item>
          <Skeleton.Button block />
        </List.Item>
      )}
    />

  const Queue =
    <List
      itemLayout="horizontal"
      dataSource={props.queue}
      renderItem={(song, index) => (
        <List.Item
          actions={[
            <DeleteButton index={index} deleteSong={props.deleteSong} />
          ]}>
          <SongListItem song={song} />
        </List.Item>
      )}
    />

  // if the queue is empty, render a skeleton. Otherwise, render the queue
  return (
    <>
      <CenteredTitle>Up next</CenteredTitle>
      {isQueueEmpty() ? SkeletonQueue : Queue}
    </>
  )
}

export default QueueViewer;