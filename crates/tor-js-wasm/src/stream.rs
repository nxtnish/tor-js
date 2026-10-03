use futures::channel::mpsc::{channel, Receiver};
use futures::future::{AbortHandle, Abortable};
use futures::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadHalf, WriteHalf};
use futures::{SinkExt, StreamExt};
use std::cell::{Cell, RefCell};
use std::rc::Rc;
use wasm_bindgen::prelude::*;

trait AsyncReadWrite: AsyncRead + AsyncWrite + Unpin {}

impl<T> AsyncReadWrite for T where T: AsyncRead + AsyncWrite + Unpin {}

type BoxedStream = Box<dyn AsyncReadWrite>;
type BoxedReader = ReadHalf<BoxedStream>;
type BoxedWriter = WriteHalf<BoxedStream>;
type ReadResult = Result<Vec<u8>, String>;

#[wasm_bindgen]
pub struct TorStream {
    receiver: Rc<RefCell<Receiver<ReadResult>>>,
    writer: Rc<RefCell<Option<BoxedWriter>>>,
    read_abort: AbortHandle,
    closed: Rc<Cell<bool>>,
}

impl TorStream {
    pub fn new<S>(stream: S) -> Self
    where
        S: AsyncRead + AsyncWrite + Unpin + 'static,
    {
        let stream: BoxedStream = Box::new(stream);
        let (reader, writer) = stream.split();
        let (sender, receiver) = channel(8);
        let (read_abort, read_registration) = AbortHandle::new_pair();

        wasm_bindgen_futures::spawn_local(async move {
            let _ = Abortable::new(read_loop(reader, sender), read_registration).await;
        });

        Self {
            receiver: Rc::new(RefCell::new(receiver)),
            writer: Rc::new(RefCell::new(Some(writer))),
            read_abort,
            closed: Rc::new(Cell::new(false)),
        }
    }
}

async fn read_loop(
    mut reader: BoxedReader,
    mut sender: futures::channel::mpsc::Sender<ReadResult>,
) {
    let mut buffer = vec![0u8; 16 * 1024];
    loop {
        match reader.read(&mut buffer).await {
            Ok(0) => return,
            Ok(length) => {
                if sender.send(Ok(buffer[..length].to_vec())).await.is_err() {
                    return;
                }
            }
            Err(error) => {
                let _ = sender.send(Err(error.to_string())).await;
                return;
            }
        }
    }
}

#[wasm_bindgen]
impl TorStream {
    #[wasm_bindgen(js_name = read, skip_typescript)]
    pub fn read(&self) -> js_sys::Promise {
        let receiver = Rc::clone(&self.receiver);
        wasm_bindgen_futures::future_to_promise(async move {
            let mut receiver = receiver
                .try_borrow_mut()
                .map_err(|_| js_error("A TorStream read is already pending"))?;
            match receiver.next().await {
                Some(Ok(chunk)) => Ok(js_sys::Uint8Array::from(chunk.as_slice()).into()),
                Some(Err(error)) => Err(js_sys::Error::new(&error).into()),
                None => Ok(JsValue::NULL),
            }
        })
    }

    #[wasm_bindgen(js_name = write, skip_typescript)]
    pub fn write(&self, data: js_sys::Uint8Array) -> js_sys::Promise {
        if self.closed.get() {
            return rejected_promise("TorStream is closed");
        }

        let bytes = data.to_vec();
        let writer = Rc::clone(&self.writer);
        wasm_bindgen_futures::future_to_promise(async move {
            let mut writer = writer
                .try_borrow_mut()
                .map_err(|_| js_error("A TorStream write is already pending"))?;
            let writer = writer
                .as_mut()
                .ok_or_else(|| js_error("TorStream is closed"))?;
            writer
                .write_all(&bytes)
                .await
                .map_err(|error| js_error(&format!("TorStream write failed: {error}")))?;
            writer
                .flush()
                .await
                .map_err(|error| js_error(&format!("TorStream flush failed: {error}")))?;
            Ok(JsValue::UNDEFINED)
        })
    }

    #[wasm_bindgen(js_name = close, skip_typescript)]
    pub fn close(&self) -> js_sys::Promise {
        if self.closed.replace(true) {
            return resolved_promise();
        }

        self.read_abort.abort();
        let writer = Rc::clone(&self.writer);
        wasm_bindgen_futures::future_to_promise(async move {
            let mut writer = writer
                .try_borrow_mut()
                .map_err(|_| js_error("A TorStream write is still pending"))?;
            if let Some(mut writer) = writer.take() {
                writer
                    .close()
                    .await
                    .map_err(|error| js_error(&format!("TorStream close failed: {error}")))?;
            }
            Ok(JsValue::UNDEFINED)
        })
    }
}

impl Drop for TorStream {
    fn drop(&mut self) {
        self.closed.set(true);
        self.read_abort.abort();
        if let Ok(mut writer) = self.writer.try_borrow_mut() {
            writer.take();
        }
    }
}

fn resolved_promise() -> js_sys::Promise {
    js_sys::Promise::resolve(&JsValue::UNDEFINED)
}

fn rejected_promise(message: &str) -> js_sys::Promise {
    js_sys::Promise::reject(&js_error(message))
}

fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
