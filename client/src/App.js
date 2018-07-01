import React, { Component } from 'react'
import './App.css'
import ReactTable from 'react-table'
import 'react-table/react-table.css'
import SpotifyWebApi from 'spotify-web-api-js'
const spotifyApi = new SpotifyWebApi()

const Task = require('data.task')
const { List } = require('immutable-ext')
//const { Pair, Sum } = require('./monoid')
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

    // remove one level of array nesting
    const flatten = xs => xs.reduce((acc, cur) => acc.concat(cur), [])

    const related = name =>
      findArtist(name)
        .map(artist => artist.id)
        .chain(relatedArtists)

    const dumper = x => {
      console.log(x)
      return x
    }

    const id = x => x

    const main = names =>
      List(names)
        .traverse(Task.of, related)
        .map(artists =>
          flatten(artists)
            .map(id)
            .map(artist => ({
              name: artist.name,
              id: artist.id,
              popularity: artist.popularity,
              genres: artist.genres,
              image: artist.images[0] ? artist.images[0].url : '',
              spotify: artist.external_urls.spotify
            }))
        )

    // xs is array of hash
    const process = xs => {
      const rels = xs.reduce((acc, cur) => {
        let cnt = acc[cur.name] && acc[cur.name].count ? acc[cur.name].count : 0
        acc[cur.name] = Object.assign(cur, { count: cnt + 1 })
        return acc
      }, {})
      const relsAry = Object.values(rels).map(el =>
        Object.assign(el, { score: el.count * el.popularity })
      )

      this.setState({
        related: relsAry
      })
    }

    // run it
    names.chain(main).fork(console.error, process)
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

  handleAddToArtists(name) {
    const value = this.state.value ? this.state.value + ',' + name : name
    this.setState({ value: value })
  }

  render() {
    const loggedIn = this.state.loggedIn
    const data = this.state.related
    const columns = [
      {
        Header: 'Artist',
        accessor: 'name', // String-based value accessors!
        Cell: props => (
          <div>
            <button onClick={() => this.handleAddToArtists(props.value)}>
              Add
            </button>
            <br />
            <span className="text">{props.value}</span>
          </div>
        )
      },
      {
        Header: 'Count',
        accessor: 'count',
        minWidth: 50,
        Cell: props => <span className="number">{props.value}</span> // Custom cell components!
      },
      {
        Header: 'Popularity',
        accessor: 'popularity',
        minWidth: 50,
        Cell: props => <span className="number">{props.value}</span> // Custom cell components!
      },
      {
        Header: 'Score',
        accessor: 'score',
        minWidth: 50,
        Cell: props => <span className="number">{props.value}</span> // Custom cell components!
      },
      {
        Header: 'Genres',
        accessor: 'genres',
        minWidth: 200,
        className: 'genres',
        Cell: props => <span className="genres">{props.value.join(', ')}</span>
      },
      {
        Header: 'Play',
        accessor: 'image',
        Cell: props => {
          return (
            <div>
              <a href={props.value}>
                {props.value && <img alt="" height={100} src={props.value} />}
              </a>
            </div>
          )
        }
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
        {loggedIn && (
          <button onClick={() => this.getNowPlaying()}>
            Check Now Playing
          </button>
        )}
        {loggedIn && (
          <div>
            Related Artists
            <form onSubmit={this.handleSubmit}>
              <label>
                Artists:
                <input
                  style={{ width: '370px', fontSize: '20px' }}
                  type="text"
                  value={this.state.value}
                  onChange={this.handleChange}
                />
              </label>
              <input type="submit" value="Submit" />
            </form>
          </div>
        )}
        {loggedIn && (
          <div>
            <ReactTable pageSize={100} data={data} columns={columns} />
          </div>
        )}
      </div>
    )
  }
}

export default App
