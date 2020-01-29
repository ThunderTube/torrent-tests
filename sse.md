# SSE and movie downloading

## Introduction

The movie must be downloaded server side once when a user wants to watch it.
This user must be able to start watching it before the end of its downloading.
For that we have to download a small part of the movie before letting the user download it from the server.
The browser will download the video by chunks, we have to ensure the requested chunks have been downloaded on the server side.

## SSE

We will use SSE (Server-Sent Events) to notify the user when the movie downloading can start.
We must store the `res` object of the request initiating the SSE (cf. https://medium.com/@moinism/using-nodejs-for-uni-directional-event-streaming-sse-c80538e6e82e).
This object will permit us to send data to the client whenever we want to.
