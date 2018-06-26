import React, { Component } from 'react'
import './App.css'
import ReactTable from 'react-table'
import 'react-table/react-table.css'
import SpotifyWebApi from 'spotify-web-api-js'
const spotifyApi = new SpotifyWebApi()

const Task = require('data.task')
const { List } = require('immutable-ext')
const { Pair, Sum } = require('./monoid')
const Either = require('data.either')

class App extends Component {
  constructor() {
    super()
    const params = this.getHashParams()
    const token = params.access_token
    if (token) {
      spotifyApi.setAccessToken(token)
    }
    this.state = {
      loggedIn: token ? true : false,
      nowPlaying: { name: 'Not Checked', albumArt: '' },
      value: '',
      artist: '',
      related: []
    }
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(event) {
    this.setState({ value: event.target.value })
  }

  handleSubmit(event) {
    this.dataflow(this.state.value)
    event.preventDefault()
  }

  dataflow(query) {
    if (!query) return
    const threshhold = 0
    const names = new Task((rej, res) =>
      res(query.split(',').map(s => s.trim()))
    )

    const first = xs => Either.fromNullable(xs[0])

    const eitherToTask = e => e.fold(Task.rejected, Task.of)

    const searchArtistsTask = query =>
      new Task((rej, res) => spotifyApi.searchArtists(query).then(res, rej))

    const relatedArtistsTask = id =>
      new Task((rej, res) =>
        spotifyApi.getArtistRelatedArtists(id).then(res, rej)
      )

    const findArtist = query =>
      searchArtistsTask(query)
        .map(result => result.artists.items)
        .map(first)
        .chain(eitherToTask)

    const relatedArtists = id =>
      relatedArtistsTask(id).map(result => result.artists)

    const related = name =>
      findArtist(name)
        .map(artist => artist.id)
        .chain(relatedArtists)
        .map(artists => artists.map(artist => artist.name))

    // reduce an array with dups to an array of elems with counts
    const rank = xs =>
      xs.reduce((acc, cur) => {
        acc[cur] = (acc[cur] || 0) + 1
        return acc
      }, {})

    // remove one level of array nesting
    const flatten = arr =>
      arr.reduce((acc, cur) => {
        return (acc = acc.concat(cur))
      }, [])

    // transform array of elems with counts to array of objects for easy sorting
    const toArr = data =>
      Object.keys(data).map(key => ({ key, value: data[key] }))

    // sort objects by value
    const byValue = ({ value: v1 }, { value: v2 }) => v2 - v1

    // return a sorted ranking of related artists that have counts at least 2
    const sortedRank = xs =>
      toArr(rank(flatten(xs)))
        .sort(byValue)
        .filter(({ value: v }) => v > threshhold)

    const main = names =>
      List(names)
        .traverse(Task.of, related)
        //.map(artistIntersection)
        .map(sortedRank)

    const updateState = related => {
      this.setState({
        related: related
      })
    }

    // run it
    names.chain(main).fork(console.error, updateState)
  }

  getHashParams() {
    var hashParams = {}
    var e,
      r = /([^&;=]+)=?([^&;]*)/g,
      q = window.location.hash.substring(1)
    e = r.exec(q)
    while (e) {
      hashParams[e[1]] = decodeURIComponent(e[2])
      e = r.exec(q)
    }
    return hashParams
  }

  getNowPlaying() {
    spotifyApi.getMyCurrentPlaybackState().then(response => {
      this.setState({
        nowPlaying: {
          name: response.item.name,
          albumArt: response.item.album.images[0].url
        }
      })
    })
  }

  render() {
    const data = this.state.related
      ? this.state.related.map(item => ({
          artist: item.key,
          count: item.value
        }))
      : []
    const columns = [
      {
        Header: 'Artist',
        accessor: 'artist' // String-based value accessors!
      },
      {
        Header: 'Count',
        accessor: 'count',
        Cell: props => <span className="number">{props.value}</span> // Custom cell components!
      }
    ]
    return (
      <div className="App">
        <a href="http://localhost:8888"> Login to Spotify </a>
        <div>Now Playing: {this.state.nowPlaying.artist}</div>
        <div>
          <img
            alt=""
            src={this.state.nowPlaying.albumArt}
            style={{ height: 150 }}
          />
        </div>
        {this.state.loggedIn && (
          <button onClick={() => this.getNowPlaying()}>
            Check Now Playing
          </button>
        )}
        <div>
          Related Artists
          <form onSubmit={this.handleSubmit}>
            <label>
              Artists:
              <input
                type="text"
                value={this.state.value}
                onChange={this.handleChange}
              />
            </label>
            <input type="submit" value="Submit" />
          </form>
        </div>
        <div>
          <ReactTable data={data} columns={columns} />
        </div>
      </div>
    )
  }
}

export default App
