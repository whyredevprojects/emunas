/**
 * A topic opened from the listening room (concept-live-corpus D "Chapters"): the topic page
 * (`features/topics`) in a side pane on a wide screen, or a sheet from the bottom on a phone, while
 * the audio keeps playing. The page module loads on the first tap, and the pane fetches only
 * `topic/<id>.json` (the room's own first render needs nothing but the shiur file).
 */
import { livePaths } from "@emunas/links";
import { Suspense, lazy, type JSX } from "react";
import { Button, Dialog, Modal, ModalOverlay } from "react-aria-components";
import { Link } from "react-router";
import type { EntityChip } from "./data.ts";
import type { RoomContext } from "./context.ts";
import { roomStyles as s } from "./styles.ts";

const TopicPage = lazy(() => import("../topics/index.ts").then((m) => ({ default: m.TopicPage })));

const paths = livePaths();

export function TopicPane({
  room,
  topic,
  onClose,
}: {
  room: Pick<RoomContext, "ui" | "rt">;
  topic: EntityChip | null;
  onClose: () => void;
}): JSX.Element {
  const { ui, rt } = room;
  return (
    <ModalOverlay
      className={s.paneOverlay}
      isDismissable
      isOpen={topic !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal className={s.pane}>
        {topic ? (
          <Dialog className={s.paneDialog} aria-label={rt("pane.label", { topic: topic.label[ui] })} data-topic-pane={topic.id}>
            <div className={s.paneHead}>
              <Link to={paths.topic(ui, topic.id)} className={s.relatedLink}>
                {rt("pane.fullPage")}
              </Link>
              <Button slot="close" className={s.textAction}>
                {rt("pane.close")}
              </Button>
            </div>
            <Suspense fallback={<p className={s.note}>{rt("pane.loading")}</p>}>
              <TopicPage topicId={topic.id} ui={ui} />
            </Suspense>
          </Dialog>
        ) : null}
      </Modal>
    </ModalOverlay>
  );
}
